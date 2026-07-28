import { Pool } from 'pg';
import type { PoolClient } from 'pg';

type IntegratorMigrationPoolProviderConfig = {
  connectionString: string;
};

function prepareIntegratorMigrationPoolClient(_client: PoolClient): void {
  // Dormant SAAS hook: migrator/admin DB principal setup belongs here.
}

export function createIntegratorMigrationPoolProvider(
  config: IntegratorMigrationPoolProviderConfig,
): Pool {
  const pool = new Pool({ connectionString: config.connectionString });
  pool.on('connect', prepareIntegratorMigrationPoolClient);
  return pool;
}
