import pg from 'pg';
import type { PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { ProjectionHealthQueryable } from '../db/repos/projectionHealthCore.js';

const { Pool } = pg;

export type ProjectionHealthPool = ProjectionHealthQueryable & {
  end(): Promise<void>;
};

function prepareProjectionHealthPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: ops-script DB principal setup belongs here.
}

export function createProjectionHealthPoolProvider(connectionString: string): ProjectionHealthPool {
  const pool = new Pool({ connectionString });
  pool.on('connect', prepareProjectionHealthPoolClient);
  const db = drizzle(pool);
  return {
    execute: (fragment) =>
      db.execute(fragment) as Promise<{ rows: Record<string, unknown>[] }>,
    end: () => pool.end(),
  };
}
