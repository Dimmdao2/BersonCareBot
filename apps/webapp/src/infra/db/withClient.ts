import type { Pool, PoolClient } from 'pg';
import {
  applyDbPrincipalToConnection,
  applyDbPrincipalToTransaction,
  assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  getCurrentDbPrincipal,
  type DbPrincipal,
  type DbPrincipalApplyOptions,
} from '@bersoncare/db-principal';
import { startPortContextTransaction, withPortContextTransaction } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import {
  reportDbCleanupFailure,
  reportDbQueryFailure,
  reportPrincipalSetupFailure,
} from '@/infra/db/saasIsolationDbFailureReporting';
import {
  createWebappPortContextRuntimeConfig,
  webappPortContextPrincipal,
} from '@/infra/db/portContextRuntime';

function isPortContextMode(): boolean {
  return process.env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context';
}

function currentWebappPortContextPrincipal() {
  const config = createWebappPortContextRuntimeConfig(process.env);
  return webappPortContextPrincipal(getCurrentDbPrincipal(), config.capabilities).principal;
}

async function withPortContextPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const principal = currentWebappPortContextPrincipal();
  const client = await pool.connect();
  let completed = false;
  try {
    const result = await withPortContextTransaction(client, principal, async (sameClient) =>
      fn(sameClient as PoolClient),
    );
    completed = true;
    return result;
  } finally {
    if (completed) client.release();
  }
}

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

async function prepareClientForRequest(
  client: PoolClient,
  principal: DbPrincipal | undefined,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyDbPrincipalToConnection(client, principal, options);
}

async function releasePreparedClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
  principal: DbPrincipal | undefined,
): Promise<void> {
  let cleanupError: unknown;
  try {
    await clearDbPrincipalFromConnection(client, options, principal);
  } catch (err) {
    cleanupError = err;
    await reportDbCleanupFailure();
    throw err;
  } finally {
    if (cleanupError === undefined) {
      client.release();
    } else {
      client.release(
        cleanupError instanceof Error ? cleanupError : new Error('DB principal cleanup failed'),
      );
    }
  }
}

async function releasePreparedClientAfterSetupFailure(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
  principal: DbPrincipal | undefined,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options, principal);
  } catch (err) {
    client.release(err instanceof Error ? err : new Error('DB principal cleanup failed'));
    return;
  }
  try {
    client.release();
  } catch {
    /* release is synchronous in pg; keep setup failure if a mock throws */
  }
}

async function prepareTransactionClientForRequest(
  client: PoolClient,
  principal: DbPrincipal | undefined,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyDbPrincipalToTransaction(client, principal, options);
}

export async function withPoolClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isPortContextMode()) return withPortContextPoolTransaction(pool, fn);
  // Keep selection, checkout and principal install bound to the same request identity.
  const principalSnapshot = getCurrentDbPrincipal();
  const principalApplyOptions = getDbPrincipalApplyOptions();
  try {
    assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
      principalSnapshot,
      principalApplyOptions,
    );
  } catch (error) {
    await reportPrincipalSetupFailure(error);
    throw error;
  }
  const client = await pool.connect();
  try {
    try {
      await prepareClientForRequest(client, principalSnapshot, principalApplyOptions);
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
    await releasePreparedClient(client, principalApplyOptions, principalSnapshot);
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
  if (isPortContextMode()) {
    const principal = currentWebappPortContextPrincipal();
    const client = await pool.connect();
    let handle: Awaited<ReturnType<typeof startPortContextTransaction>>;
    try {
      handle = await startPortContextTransaction(client, principal);
    } catch (error) {
      // The shared lifecycle has already destroyed this exact checkout.
      throw error;
    }
    return {
      client: handle.client as PoolClient,
      commit: () => handle.commit(),
      rollback: () => handle.rollback(),
      release: async () => handle.release(),
    };
  }
  // Keep both connection- and transaction-scope installs bound to the pre-checkout identity.
  const principalSnapshot = getCurrentDbPrincipal();
  const principalApplyOptions = getDbPrincipalApplyOptions();
  try {
    assertDbPrincipalRequestPoolCheckoutAllowedForPrincipal(
      principalSnapshot,
      principalApplyOptions,
    );
  } catch (error) {
    await reportPrincipalSetupFailure(error);
    throw error;
  }
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareClientForRequest(client, principalSnapshot, principalApplyOptions);
    await client.query('BEGIN');
    transactionStarted = true;
    await prepareTransactionClientForRequest(client, principalSnapshot, principalApplyOptions);
  } catch (err) {
    await reportPrincipalSetupFailure(err);
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedClientAfterSetupFailure(client, principalApplyOptions, principalSnapshot);
    throw err;
  }
  return {
    client,
    commit: async () => {
      await client.query('COMMIT');
    },
    rollback: async () => {
      await client.query('ROLLBACK');
    },
    release: async () => {
      await releasePreparedClient(client, principalApplyOptions, principalSnapshot);
    },
  };
}

export async function withPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (isPortContextMode()) return withPortContextPoolTransaction(pool, fn);
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
