import type { Pool, PoolClient } from 'pg';

async function prepareIntegratorClient(_client: PoolClient): Promise<void> {
  // Dormant SAAS hook: future tenant/app principal setup belongs here.
}

export async function checkoutIntegratorPoolClient(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  try {
    await prepareIntegratorClient(client);
    return client;
  } catch (err) {
    client.release();
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
    client.release();
  }
}
