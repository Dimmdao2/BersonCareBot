import type { Pool } from 'pg';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { withPoolClient } from '@/infra/db/withClient';
import {
  createWebappPoolProvider,
  getWebappPoolRoutingMetrics,
  type WebappPoolRoutingMetrics,
} from '@/infra/db/webappPoolProvider';
import { createWebappPortContextRuntimeConfig } from '@/infra/db/portContextRuntime';

export const DATABASE_URL_STAFF_ENV = 'DATABASE_URL_STAFF';
export const DATABASE_URL_NONSTAFF_ENV = 'DATABASE_URL_NONSTAFF';

let pool: Pool | null = null;

type WebappRuntimeDatabaseEnv = {
  DATABASE_URL?: string;
  DATABASE_URL_STAFF?: string;
  DATABASE_URL_NONSTAFF?: string;
};

function trimOptionalEnv(value: string | undefined): string {
  return (value ?? '').trim();
}

export function resolveWebappPoolProviderConfig(
  input: WebappRuntimeDatabaseEnv,
): Parameters<typeof createWebappPoolProvider>[0] {
  const legacyConnectionString = trimOptionalEnv(input.DATABASE_URL);
  const staffConnectionString = trimOptionalEnv(input.DATABASE_URL_STAFF);
  const nonstaffConnectionString = trimOptionalEnv(input.DATABASE_URL_NONSTAFF);

  if (!staffConnectionString && !nonstaffConnectionString) {
    if (!legacyConnectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    return { connectionString: legacyConnectionString };
  }

  const resolvedStaffConnectionString = staffConnectionString || legacyConnectionString;
  const resolvedNonstaffConnectionString = nonstaffConnectionString || legacyConnectionString;
  if (!resolvedStaffConnectionString || !resolvedNonstaffConnectionString) {
    throw new Error(
      'DATABASE_URL_STAFF and DATABASE_URL_NONSTAFF must both be set, or DATABASE_URL must be set as fallback',
    );
  }

  return {
    connectionString: legacyConnectionString || undefined,
    staffConnectionString: resolvedStaffConnectionString,
    nonstaffConnectionString: resolvedNonstaffConnectionString,
  };
}

function readWebappRuntimeDatabaseEnv(): WebappRuntimeDatabaseEnv {
  return {
    DATABASE_URL: env.DATABASE_URL || process.env.DATABASE_URL,
    DATABASE_URL_STAFF: process.env[DATABASE_URL_STAFF_ENV],
    DATABASE_URL_NONSTAFF: process.env[DATABASE_URL_NONSTAFF_ENV],
  };
}

export function getPool(): Pool {
  pool ??= env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
    ? createWebappPoolProvider({
        portContext: createWebappPortContextRuntimeConfig({
          DATABASE_URL_STAFF: env.DATABASE_URL_STAFF,
          DATABASE_URL_PATIENT: env.DATABASE_URL_PATIENT,
          WEBAPP_DB_STAFF_LOGIN: env.WEBAPP_DB_STAFF_LOGIN,
          WEBAPP_DB_PATIENT_LOGIN: env.WEBAPP_DB_PATIENT_LOGIN,
          WEBAPP_DB_TLS_CA_FILE: env.WEBAPP_DB_TLS_CA_FILE,
          WEBAPP_DB_STAFF_CERT_FILE: env.WEBAPP_DB_STAFF_CERT_FILE,
          WEBAPP_DB_STAFF_KEY_FILE: env.WEBAPP_DB_STAFF_KEY_FILE,
          WEBAPP_DB_PATIENT_CERT_FILE: env.WEBAPP_DB_PATIENT_CERT_FILE,
          WEBAPP_DB_PATIENT_KEY_FILE: env.WEBAPP_DB_PATIENT_KEY_FILE,
          WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON: env.WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON,
        }),
      })
    : createWebappPoolProvider(resolveWebappPoolProviderConfig(readWebappRuntimeDatabaseEnv()));

  return pool;
}

/** Read the already-collected counters without creating a pool or doing I/O. */
export function getCurrentWebappPoolRoutingMetrics(): WebappPoolRoutingMetrics | undefined {
  return pool ? getWebappPoolRoutingMetrics(pool) : undefined;
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    resolveWebappPoolProviderConfig(readWebappRuntimeDatabaseEnv());
  } catch {
    return false;
  }
  try {
    return await runWithDbBootstrapPrincipal({ source: 'webapp-health-check' }, () =>
      withPoolClient(getPool(), async (client) => {
        await client.query('select 1');
        return true;
      }),
    );
  } catch {
    return false;
  }
}
