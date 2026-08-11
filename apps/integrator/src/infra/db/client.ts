import type { Pool, QueryResultRow } from 'pg';
import { createHash } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getCurrentDbPrincipal, runWithDbInfraPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';
import { logger } from '../observability/logger.js';
import { createIntegratorPoolProvider, type IntegratorPortContextPool } from './integratorPoolProvider.js';
import { createIntegratorPortContextRuntimeConfig } from './portContextRuntime.js';
import { integratorDrizzleSchema } from './integratorDrizzleSchema.js';
import {
  checkoutIntegratorPoolClient,
  prepareIntegratorTransactionClient,
  releasePreparedIntegratorClient,
  withIntegratorPoolClient,
  withIntegratorPoolTransaction,
} from './withClient.js';
import { reportIntegratorIsolationFailure } from '../observability/saasIsolationTelemetry.js';

function databaseUrlDiagnostics(): {
  databaseUrlConfigured: boolean;
  databaseHost?: string;
  databaseName?: string;
} {
  const raw = env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
    ? env.INTEGRATOR_DB_URL
    : env.DATABASE_URL;
  if (raw == null || String(raw).trim() === '') {
    return { databaseUrlConfigured: false };
  }
  try {
    const u = new URL(String(raw));
    const name = u.pathname.replace(/^\//, '');
    return {
      databaseUrlConfigured: true,
      databaseHost: u.hostname,
      ...(name ? { databaseName: name } : {}),
    };
  } catch {
    return { databaseUrlConfigured: true };
  }
}

const PG_SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

/** PostgreSQL SQLSTATE ("code") и его класс (первые 2 символа), если ошибка похожа на pg. */
function safeErrorCodeContext(err: unknown): Record<string, string> {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && PG_SQLSTATE_PATTERN.test(code)) {
      return { pgCode: code, pgClass: code.slice(0, 2) };
    }
  }
  return {};
}

/** Стабильный отпечаток запроса без текста SQL — для корреляции повторяющихся ошибок. */
function queryFingerprint(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex').slice(0, 16);
}

/** Безопасный контекст запроса: отпечаток + источник DB-принципала, без sql/params. */
function safeQueryErrorContext(sql: string): Record<string, string> {
  const principal = getCurrentDbPrincipal();
  return {
    queryFingerprint: queryFingerprint(sql),
    ...(principal?.source ? { dbPrincipalSource: principal.source } : {}),
  };
}

/**
 * Логирует ошибку БД без raw sql/params/error dump. Если сам логгер падает,
 * fallback печатает только уже безопасные поля — никогда исходную ошибку целиком.
 */
function logDbError(fields: Record<string, unknown>, msg: string): void {
  try {
    logger.error(fields, msg);
  } catch {
    try {
      console.error(msg, {
        queryFingerprint: fields.queryFingerprint,
        pgCode: fields.pgCode,
        pgClass: fields.pgClass,
      });
    } catch {
      /* logging must never throw past the original DB error */
    }
  }
}

/** Общий пул подключений к PostgreSQL. */
export const db = createIntegratorPoolProvider({
  ...(env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context'
    ? {
        connectionString: env.INTEGRATOR_DB_URL,
        portContext: createIntegratorPortContextRuntimeConfig({
          INTEGRATOR_DB_URL: env.INTEGRATOR_DB_URL,
          INTEGRATOR_DB_LOGIN: env.INTEGRATOR_DB_LOGIN,
          INTEGRATOR_DB_TLS_CA_FILE: env.INTEGRATOR_DB_TLS_CA_FILE,
          INTEGRATOR_DB_TLS_CERT_FILE: env.INTEGRATOR_DB_TLS_CERT_FILE,
          INTEGRATOR_DB_TLS_KEY_FILE: env.INTEGRATOR_DB_TLS_KEY_FILE,
          INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON: env.INTEGRATOR_PORT_CONTEXT_CAPABILITIES_JSON,
        }),
      }
    : {
        connectionString: env.DATABASE_URL,
      }),
});

db.on('error', (err) => {
  logDbError(
    {
      err,
      ...databaseUrlDiagnostics(),
      ...safeErrorCodeContext(err),
      db_env: {
        PGHOST: process.env.PGHOST,
        PGPORT: process.env.PGPORT,
        PGUSER: process.env.PGUSER,
        PGDATABASE: process.env.PGDATABASE,
        PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
      },
    },
    '[db][pool] connection error',
  );
});

export function createDbPort(pool: Pool = db): DbPort {
  return {
    async query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
      try {
        return await withIntegratorPoolClient(pool, async (client) => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as T[],
            ...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
          };
        });
      } catch (err) {
        logDbError(
          {
            err,
            ...databaseUrlDiagnostics(),
            ...safeQueryErrorContext(sql),
            ...safeErrorCodeContext(err),
            db_env: {
              PGHOST: process.env.PGHOST,
              PGPORT: process.env.PGPORT,
              PGUSER: process.env.PGUSER,
              PGDATABASE: process.env.PGDATABASE,
              PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
            },
          },
          '[db][query] error',
        );
        throw err;
      }
    },
    async tx<T>(fn: (txDb: DbPort) => Promise<T>): Promise<T> {
      if (env.DB_PRINCIPAL_CONTEXT_MODE === 'port-context') {
        return withIntegratorPoolTransaction(pool, async (client) => {
          const integratorDrizzle = drizzle(client, { schema: integratorDrizzleSchema });
          const txPort: DbPort = {
            integratorDrizzle,
            query: async <Row = QueryResultRow>(
              sql: string,
              params?: unknown[],
            ): Promise<DbQueryResult<Row>> => {
              const res = await client.query(sql, params);
              return {
                rows: res.rows as Row[],
                ...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
              };
            },
            tx: async <Row>(nested: (inner: DbPort) => Promise<Row>): Promise<Row> => nested(txPort),
          };
          return fn(txPort);
        });
      }
      let client;
      try {
        client = await checkoutIntegratorPoolClient(pool);
      } catch (err) {
        logDbError(
          {
            err,
            dbFailureStage: 'pool_checkout_or_principal_setup',
            ...databaseUrlDiagnostics(),
            ...safeErrorCodeContext(err),
            db_env: {
              PGHOST: process.env.PGHOST,
              PGPORT: process.env.PGPORT,
              PGUSER: process.env.PGUSER,
              PGDATABASE: process.env.PGDATABASE,
              PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
            },
          },
          '[db][tx] checkout or principal setup failed',
        );
        throw err;
      }
      try {
        await client.query('BEGIN');
        await prepareIntegratorTransactionClient(client);
        const integratorDrizzle = drizzle(client, { schema: integratorDrizzleSchema });
        const txPort: DbPort = {
          integratorDrizzle,
          query: async <Row = QueryResultRow>(
            sql: string,
            params?: unknown[],
          ): Promise<DbQueryResult<Row>> => {
            try {
              const res = await client.query(sql, params);
              return {
                rows: res.rows as Row[],
                ...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
              };
            } catch (err) {
              logDbError(
                {
                  err,
                  ...databaseUrlDiagnostics(),
                  ...safeQueryErrorContext(sql),
                  ...safeErrorCodeContext(err),
                  db_env: {
                    PGHOST: process.env.PGHOST,
                    PGPORT: process.env.PGPORT,
                    PGUSER: process.env.PGUSER,
                    PGDATABASE: process.env.PGDATABASE,
                    PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
                  },
                },
                '[db][tx][query] error',
              );
              throw err;
            }
          },
          tx: async <Row>(nested: (inner: DbPort) => Promise<Row>): Promise<Row> => nested(txPort),
        };
        const result = await fn(txPort);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        logDbError(
          {
            err,
            ...databaseUrlDiagnostics(),
            ...safeErrorCodeContext(err),
            db_env: {
              PGHOST: process.env.PGHOST,
              PGPORT: process.env.PGPORT,
              PGUSER: process.env.PGUSER,
              PGDATABASE: process.env.PGDATABASE,
              PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
            },
          },
          '[db][tx] error, rolled back',
        );
        throw err;
      } finally {
        await releasePreparedIntegratorClient(client);
      }
    },
  };
}

/** Runtime certificate-overlap operation: atomically route new checkouts then drain/end old pool. */
export async function rotateIntegratorPortContextPool(
  nextEnv: Record<string, string | undefined>,
  drainTimeoutMs?: number,
): Promise<void> {
  if (env.DB_PRINCIPAL_CONTEXT_MODE !== 'port-context') {
    throw new Error('Integrator port-context pool rotation is unavailable outside port-context mode');
  }
  const rotating = db as IntegratorPortContextPool;
  if (typeof rotating.rotatePortContextPool !== 'function') {
    throw new Error('Integrator port-context pool rotation is not installed');
  }
  await rotating.rotatePortContextPool(createIntegratorPortContextRuntimeConfig(nextEnv), drainTimeoutMs);
}

/** Проверяет доступность БД коротким health-запросом. */
export async function healthCheckDb(): Promise<boolean> {
  try {
    const res = await runWithDbInfraPrincipal({ source: 'integrator-health-check' }, () =>
      db.query('SELECT 1'),
    );
    return res.rowCount === 1;
  } catch (error) {
    reportIntegratorIsolationFailure(error);
    return false;
  }
}

export async function closeDb(): Promise<void> {
  await db.end();
}
