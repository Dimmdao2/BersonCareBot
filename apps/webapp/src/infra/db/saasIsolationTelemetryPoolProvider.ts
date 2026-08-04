import { Pool } from 'pg';
import type { PoolConfig } from 'pg';
import { logger } from '@/app-layer/logging/logger';

type SaasIsolationTelemetryPoolProviderConfig = {
  connectionString: string;
  applicationName: string;
  poolFactory?: (config: PoolConfig) => Pool;
};

/** Dedicated true-global telemetry transport; never reused as a principal-aware request pool. */
export function createSaasIsolationTelemetryPoolProvider(
  config: SaasIsolationTelemetryPoolProviderConfig,
): Pool {
  const poolFactory = config.poolFactory ?? ((poolConfig: PoolConfig) => new Pool(poolConfig));
  const pool = poolFactory({
    connectionString: config.connectionString,
    max: 1,
    application_name: config.applicationName,
    connectionTimeoutMillis: 250,
    query_timeout: 200,
    statement_timeout: 200,
    idle_in_transaction_session_timeout: 200,
  });
  // node-postgres requires a Pool-level 'error' listener for backend-initiated terminations on an
  // idle client (e.g. the server restarting or an admin killing the connection) -- without one, the
  // error becomes an uncaught exception and crashes the whole process. This pool is explicitly
  // best-effort telemetry (see `reportSaasIsolationEventBestEffort`); losing it must never do that.
  pool.on('error', (error) => {
    logger.warn({ err: error, applicationName: config.applicationName }, 'saas_isolation_telemetry_pool_error');
  });
  return pool;
}
