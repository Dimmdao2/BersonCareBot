import type { Pool, PoolClient } from 'pg';
import {
  applyCurrentDbPrincipalToConnection,
  applyCurrentDbPrincipalToTransaction,
  clearDbPrincipalFromConnection,
} from '@bersoncare/db-principal';

async function prepareIntegratorClient(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToConnection(client);
}

export async function prepareIntegratorTransactionClient(client: PoolClient): Promise<void> {
  await applyCurrentDbPrincipalToTransaction(client);
}

export async function releasePreparedIntegratorClient(client: PoolClient): Promise<void> {
  try {
    await clearDbPrincipalFromConnection(client);
  } finally {
    client.release();
  }
}

export async function checkoutIntegratorPoolClient(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client);
    return client;
  } catch (err) {
    await releasePreparedIntegratorClient(client);
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
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client);
    await client.query('BEGIN');
    await prepareIntegratorTransactionClient(client);
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
    await releasePreparedIntegratorClient(client);
  }
}
