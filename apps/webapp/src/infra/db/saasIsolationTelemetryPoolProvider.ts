import { Pool } from 'pg';
import type { PoolConfig } from 'pg';

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
  return poolFactory({
    connectionString: config.connectionString,
    max: 1,
    application_name: config.applicationName,
    connectionTimeoutMillis: 250,
    query_timeout: 200,
    statement_timeout: 200,
    idle_in_transaction_session_timeout: 200,
  });
}
