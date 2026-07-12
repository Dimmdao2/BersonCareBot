import type { Pool, PoolClient } from 'pg';
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  buildDbPrincipalApplyOptionsFromEnv,
  clearDbPrincipalFromConnection,
  type DbPrincipalApplyOptions,
} from '@bersoncare/db-principal';

const principalApplyOptionsByClient = new WeakMap<PoolClient, DbPrincipalApplyOptions>();

function getDbPrincipalApplyOptions(): DbPrincipalApplyOptions {
  return buildDbPrincipalApplyOptionsFromEnv(process.env);
}

function rememberPreparedClient(client: PoolClient, options: DbPrincipalApplyOptions): void {
  principalApplyOptionsByClient.set(client, options);
}

function forgetPreparedClient(client: PoolClient): void {
  principalApplyOptionsByClient.delete(client);
}

function getPreparedClientOptions(client: PoolClient): DbPrincipalApplyOptions {
  return principalApplyOptionsByClient.get(client) ?? getDbPrincipalApplyOptions();
}

function toReleaseError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

async function prepareIntegratorClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions,
): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client, options);
  rememberPreparedClient(client, options);
}

export async function prepareIntegratorTransactionClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions = getPreparedClientOptions(client),
): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client, options);
}

export async function releasePreparedIntegratorClient(
  client: PoolClient,
  options: DbPrincipalApplyOptions = getPreparedClientOptions(client),
): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client, options);
  } finally {
    forgetPreparedClient(client);
    client.release();
  }
}

export async function destroyPreparedIntegratorClient(client: PoolClient, err: unknown): Promise<void> {
  forgetPreparedClient(client);
  const releaseWithError = client.release as unknown as (releaseError?: Error) => void;
  releaseWithError(toReleaseError(err));
}

export async function checkoutIntegratorPoolClient(pool: Pool): Promise<PoolClient> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client, principalApplyOptions);
    return client;
  } catch (err) {
    await releasePreparedIntegratorClient(client, principalApplyOptions);
    throw err;
  }
}

export async function withIntegratorPoolClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await checkoutIntegratorPoolClient(pool);
  try {
    return await fn(client);
  } finally {
    await releasePreparedIntegratorClient(client);
  }
}

export async function withIntegratorPoolTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const principalApplyOptions = getDbPrincipalApplyOptions();
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client, principalApplyOptions);
    await client.query('BEGIN');
    await prepareIntegratorTransactionClient(client, principalApplyOptions);
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* preserve original error */
    }
    throw err;
  } finally {
    await releasePreparedIntegratorClient(client, principalApplyOptions);
  }
}
