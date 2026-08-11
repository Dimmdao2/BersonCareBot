import type { Pool } from 'pg';
import { runWithDbBootstrapPrincipal, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { env } from '@/config/env';
import { withPoolClient } from '@/infra/db/withClient';
import {
  createWebappPoolProvider,
  getWebappPoolRoutingMetrics,
  type WebappPortContextPool,
  type WebappPoolRoutingMetrics,
} from '@/infra/db/webappPoolProvider';
import { createWebappPortContextRuntimeConfig } from '@/infra/db/portContextRuntime';

export const DATABASE_URL_STAFF_ENV = 'DATABASE_URL_STAFF';
export const DATABASE_URL_NONSTAFF_ENV = 'DATABASE_URL_NONSTAFF';

let pool: Pool | null = null;
let rotationSignalInstalled = false;
let rotationInFlight: Promise<void> | null = null;

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
  pool ??=
    env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
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

/** Runtime certificate-overlap operation: new checkouts switch first, old pools then drain/end. */
export async function rotateWebappPortContextPools(
  nextEnv: Record<string, string | undefined>,
  drainTimeoutMs?: number,
): Promise<void> {
  if (env.DB_PRINCIPAL_CONTEXT_MODE !== 'port-context') {
    throw new Error('Webapp port-context pool rotation is unavailable outside port-context mode');
  }
  const rotating = getPool() as WebappPortContextPool;
  if (typeof rotating.rotatePortContextPools !== 'function') {
    throw new Error('Webapp port-context pool rotation is not installed');
  }
  await rotating.rotatePortContextPools(
    createWebappPortContextRuntimeConfig(nextEnv),
    drainTimeoutMs,
  );
}

/** SIGHUP reloads certificate paths/URLs from the process environment without a restart. */
export function installWebappPortContextRotationSignal(): void {
  if (rotationSignalInstalled || env.DB_PRINCIPAL_CONTEXT_MODE !== 'port-context') return;
  rotationSignalInstalled = true;
  process.on('SIGHUP', () => {
    if (rotationInFlight) return;
    rotationInFlight = rotateWebappPortContextPools(process.env)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[db][rotation] webapp port-context rotation failed', { message });
      })
      .finally(() => {
        rotationInFlight = null;
      });
  });
}

/** Read the already-collected counters without creating a pool or doing I/O. */
export function getCurrentWebappPoolRoutingMetrics(): WebappPoolRoutingMetrics | undefined {
  return pool ? getWebappPoolRoutingMetrics(pool) : undefined;
}

export async function checkDbHealth(): Promise<boolean> {
  if (env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context') {
    try {
      // Validate both target mTLS pools before touching either one; no generic URL may mask a
      // missing staff/patient credential in the target topology.
      createWebappPortContextRuntimeConfig({
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
      });
      return await runWithDbInfraPrincipal({ source: 'webapp-health-check' }, () =>
        withPoolClient(getPool(), async (client) => {
          await client.query('select 1');
          return true;
        }),
      );
    } catch {
      return false;
    }
  }
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
