import pg from 'pg';
import type { Pool, PoolClient } from 'pg';

const { Pool: PgPool } = pg;

const integratorPurgePools = new Map<string, Pool>();

function prepareIntegratorPurgePoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: future per-process DB principal setup belongs here.
}

export function getIntegratorPurgePoolProvider(connectionString: string): Pool {
  let pool = integratorPurgePools.get(connectionString);
  if (!pool) {
    pool = new PgPool({ connectionString, max: 3 });
    pool.on('connect', prepareIntegratorPurgePoolClient);
    integratorPurgePools.set(connectionString, pool);
  }
  return pool;
}
