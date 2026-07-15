import type { Pool, PoolClient } from "pg";
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  getCurrentDbPrincipal,
  type DbPrincipal,
  type DbPrincipalApplyOptions,
} from "@bersoncare/db-principal";

const allowedLockedInfraSources = new Set(["media-worker:tick"]);

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

function assertAllowedMediaWorkerPrincipal(principal: DbPrincipal): void {
  const source = principal.source ?? "";
  switch (principal.kind) {
    case "organization":
      throw new Error("DB organization principal is not allowed on media-worker pool in locked mode");
    case "infra":
      if (allowedLockedInfraSources.has(source)) {
        return;
      }
      throw new Error(`DB infra principal source is not allowed on media-worker pool in locked mode: ${source || "missing"}`);
    case "bootstrap":
      throw new Error(`DB bootstrap principal source is not allowed on media-worker pool in locked mode: ${source || "missing"}`);
    case "patient":
      throw new Error("DB patient principal is not allowed on media-worker pool in locked mode");
    case "staff":
      throw new Error("DB staff principal is not allowed on media-worker pool in locked mode");
    case "integrator":
      throw new Error("DB integrator principal is not allowed on media-worker pool in locked mode");
  }
}

export function assertMediaWorkerLockedPrincipalClassified(options: DbPrincipalApplyOptions): void {
  if (options.mode !== "locked") {
    return;
  }
  const principal = getCurrentDbPrincipal();
  if (!principal) {
    throw new Error("DB principal context is required before media-worker scoped DB access in locked mode");
  }
  assertAllowedMediaWorkerPrincipal(principal);
}

async function prepareMediaWorkerClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
}

async function prepareMediaWorkerTransactionClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
}

function toReleaseError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

export type MediaWorkerTransactionHandle = {
  client: PoolClient;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
};

async function releasePreparedMediaWorkerClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  let cleanupError: unknown;
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    cleanupError = err;
    throw err;
  } finally {
    if (cleanupError === undefined) {
      client.release();
    } else {
      client.release(toReleaseError(cleanupError));
    }
  }
}

async function releasePreparedMediaWorkerClientAfterSetupFailure(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } catch (err) {
    try {
      client.release(toReleaseError(err));
    } catch {
      /* preserve original setup error */
    }
    return;
  }
  try {
    client.release();
  } catch {
    /* release is synchronous in pg; keep setup failure if a mock throws */
  }
}

export async function startMediaWorkerTransaction(pool: Pool): Promise<MediaWorkerTransactionHandle> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  assertMediaWorkerLockedPrincipalClassified(principalApplyOptions);
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await prepareMediaWorkerClient(client, principalApplyOptions);
    await client.query("BEGIN");
    transactionStarted = true;
    await prepareMediaWorkerTransactionClient(client, principalApplyOptions);
  } catch (err) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* preserve original setup error */
      }
    }
    await releasePreparedMediaWorkerClientAfterSetupFailure(client, principalApplyOptions);
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
    release: () => releasePreparedMediaWorkerClient(client, principalApplyOptions),
  };
}
