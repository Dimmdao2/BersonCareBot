import type { Pool } from 'pg';
import {
  buildDbPrincipalApplyOptionsFromEnv,
  runWithDbBootstrapPrincipal,
} from '@bersoncare/db-principal';
import { env } from '@/config/env';
import {
  createConfigReaderPoolProvider,
  type ConfigReaderPoolProvider,
} from '@/infra/db/configReaderPoolProvider';
import { withPoolClient } from '@/infra/db/withClient';
import {
  createWebappPoolProvider,
  getWebappPoolRoutingMetrics,
  type WebappPoolRoutingMetrics,
} from '@/infra/db/webappPoolProvider';

export const DATABASE_URL_STAFF_ENV = 'DATABASE_URL_STAFF';
export const DATABASE_URL_NONSTAFF_ENV = 'DATABASE_URL_NONSTAFF';
export const DATABASE_URL_CONFIG_READER_ENV = 'DATABASE_URL_CONFIG_READER';

let pool: Pool | null = null;
let configReaderPool: ConfigReaderPoolProvider | null = null;

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
  pool ??= createWebappPoolProvider(
    resolveWebappPoolProviderConfig(readWebappRuntimeDatabaseEnv()),
  );

  return pool;
}

/** Read the already-collected counters without creating a pool or doing I/O. */
export function getCurrentWebappPoolRoutingMetrics(): WebappPoolRoutingMetrics | undefined {
  return pool ? getWebappPoolRoutingMetrics(pool) : undefined;
}

export function getConfigReaderPool(): ConfigReaderPoolProvider {
  if (configReaderPool) return configReaderPool;
  const connectionString = trimOptionalEnv(process.env[DATABASE_URL_CONFIG_READER_ENV]);
  if (!connectionString) {
    throw new Error(`${DATABASE_URL_CONFIG_READER_ENV} is not set`);
  }
  configReaderPool = createConfigReaderPoolProvider({
    connectionString,
    principalApplyOptions: buildDbPrincipalApplyOptionsFromEnv(process.env),
  });
  return configReaderPool;
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
