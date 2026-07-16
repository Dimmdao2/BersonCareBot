import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  assertDbPrincipalRequestPoolCheckoutAllowed,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  getCurrentDbPrincipal,
  type DbPrincipalApplyOptions,
} from "@bersoncare/db-principal";
import { getPool } from "@/infra/db/client";
import { WEB_PUSH_REMINDER_INFRA_SOURCE } from "@/infra/db/webappPoolProvider";
import {
  reportDbCleanupFailure,
  reportDbQueryFailure,
  reportPrincipalSetupFailure,
} from "@/infra/db/saasIsolationDbFailureReporting";

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

function usesOperationalWebPushReminderPool(): boolean {
  const principal = getCurrentDbPrincipal();
  return principal?.kind === "infra" && principal.source === WEB_PUSH_REMINDER_INFRA_SOURCE;
}

async function releaseOperationalClient(client: PoolClient, error?: Error): Promise<void> {
  await (client.release(error) as unknown as Promise<void>);
}

async function prepareClientForRequest(client: PoolClient, options: DbPrincipalApplyOptions): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
}

async function releasePreparedClient(client: PoolClient, options: DbPrincipalApplyOptions): Promise<void> {
  let cleanupError: unknown;
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    cleanupError = err;
    await reportDbCleanupFailure();
    throw err;
  } finally {
    if (cleanupError === undefined) {
      client.release();
    } else {
      client.release(cleanupError instanceof Error ? cleanupError : new Error("DB principal cleanup failed"));
    }
  }
}

async function releasePreparedClientAfterSetupFailure(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    client.release(err instanceof Error ? err : new Error("DB principal cleanup failed"));
    return;
  }
  try {
    client.release();
  } catch {
    /* release is synchronous in pg; keep setup failure if a mock throws */
  }
}

async function prepareTransactionClientForRequest(client: PoolClient, options: DbPrincipalApplyOptions): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
}

export async function withPoolClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const operationalWebPushReminder = usesOperationalWebPushReminderPool();
  if (!operationalWebPushReminder) {
    try {
      assertDbPrincipalRequestPoolCheckoutAllowed(principalApplyOptions);
    } catch (error) {
      await reportPrincipalSetupFailure(error);
      throw error;
    }
  }
  const client = await pool.connect();
  try {
    try {
      if (!operationalWebPushReminder) {
        await prepareClientForRequest(client, principalApplyOptions);
      }
    } catch (error) {
      await reportPrincipalSetupFailure(error);
      throw error;
    }
    try {
      return await fn(client);
    } catch (error) {
      await reportDbQueryFailure(error);
      throw error;
    }
  } finally {
    if (operationalWebPushReminder) {
      await releaseOperationalClient(client);
    } else {
      await releasePreparedClient(client, principalApplyOptions);
    }
  }
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolClient(getPool(), fn);
}

export type PoolTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

export async function startPoolTransaction(pool: Pool): Promise<PoolTransactionHandle> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const operationalWebPushReminder = usesOperationalWebPushReminderPool();
  if (!operationalWebPushReminder) {
    try {
      assertDbPrincipalRequestPoolCheckoutAllowed(principalApplyOptions);
    } catch (error) {
      await reportPrincipalSetupFailure(error);
      throw error;
    }
  }
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    if (!operationalWebPushReminder) {
      await prepareClientForRequest(client, principalApplyOptions);
    }
    await client.query("BEGIN");
    transactionStarted = true;
    if (!operationalWebPushReminder) {
      await prepareTransactionClientForRequest(client, principalApplyOptions);
    }
  } catch (err) {
    await reportPrincipalSetupFailure(err);
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    if (operationalWebPushReminder) {
      await releaseOperationalClient(
        client,
        err instanceof Error ? err : new Error("Web Push reminder transaction setup failed"),
      );
    } else {
      await releasePreparedClientAfterSetupFailure(client, principalApplyOptions);
    }
    throw err;
  }
  return {
    client,
    commit: async () => {
      await client.query("COMMIT");
    },
    rollback: async () => {
      await client.query("ROLLBACK");
    },
    release: async () => {
      if (operationalWebPushReminder) {
        await releaseOperationalClient(client);
      } else {
        await releasePreparedClient(client, principalApplyOptions);
      }
    },
  };
}

export async function withPoolTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const tx = await startPoolTransaction(pool);
  try {
    const out = await fn(tx.client);
    await tx.commit();
    return out;
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      /* ignore rollback failures; preserve original error */
    }
    throw err;
  } finally {
    await tx.release();
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withPoolTransaction(getPool(), fn);
}
