import type { Pool } from 'pg';
import { env } from '@/config/env';
import { createSaasIsolationTelemetryPoolProvider } from '@/infra/db/saasIsolationTelemetryPoolProvider';

export const SAAS_ISOLATION_OPERATOR_DATABASE_URL_ENV = 'SAAS_ISOLATION_OPERATOR_DATABASE_URL';
let writerPool: Pool | null = null;
let operatorPool: Pool | null = null;

function writerConnectionString(): string {
  const value = (
    process.env.DATABASE_URL_NONSTAFF ||
    env.DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
  if (!value) throw new Error('DATABASE_URL is required for SaaS isolation event telemetry');
  return value;
}

function operatorConnectionString(): string {
  const value = (process.env[SAAS_ISOLATION_OPERATOR_DATABASE_URL_ENV] ?? '').trim();
  if (!value)
    throw new Error(
      `${SAAS_ISOLATION_OPERATOR_DATABASE_URL_ENV} is required for operator diagnostics`,
    );
  return value;
}

function createTelemetryPool(connectionString: string, applicationName: string): Pool {
  return createSaasIsolationTelemetryPoolProvider({
    connectionString,
    applicationName,
  });
}

/** Ambient runtime has only event-writer EXECUTE; it cannot read/resolve diagnostics. */
export function getSaasIsolationEventWriterPool(): Pool {
  writerPool ??= createTelemetryPool(writerConnectionString(), 'bcb_saas_isolation_event_writer');
  return writerPool;
}

/** Separate infrastructure credential, reached only after the global-admin application guard. */
export function getSaasIsolationOperatorPool(): Pool {
  operatorPool ??= createTelemetryPool(operatorConnectionString(), 'bcb_saas_isolation_operator');
  return operatorPool;
}
