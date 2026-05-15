import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';
import { logger } from '../observability/logger.js';
import { integratorDrizzleSchema } from './integratorDrizzleSchema.js';

function databaseUrlDiagnostics(): {
  databaseUrlConfigured: boolean;
  databaseHost?: string;
  databaseName?: string;
} {
  const raw = env.DATABASE_URL;
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

/** Общий пул подключений к PostgreSQL. */
export const db = new Pool({
	connectionString: env.DATABASE_URL,
});

db.on('error', (err) => {
	const dbDiag = databaseUrlDiagnostics();
	logger.error({
		err,
		...dbDiag,
		db_env: {
			PGHOST: process.env.PGHOST,
			PGPORT: process.env.PGPORT,
			PGUSER: process.env.PGUSER,
			PGDATABASE: process.env.PGDATABASE,
			PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
		}
	}, '[db][pool] connection error');
	console.error('[db][pool] connection error', err, {
		...dbDiag,
		db_env: {
			PGHOST: process.env.PGHOST,
			PGPORT: process.env.PGPORT,
			PGUSER: process.env.PGUSER,
			PGDATABASE: process.env.PGDATABASE,
			PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
		}
	});
});

export function createDbPort(pool: Pool = db): DbPort {
	return {
		async query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
			try {
				const res = await pool.query(sql, params);
				return {
					rows: res.rows as T[],
					...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
				};
			} catch (err) {
				const dbDiag = databaseUrlDiagnostics();
				logger.error({
					err,
					sql,
					params,
					...dbDiag,
					db_env: {
						PGHOST: process.env.PGHOST,
						PGPORT: process.env.PGPORT,
						PGUSER: process.env.PGUSER,
						PGDATABASE: process.env.PGDATABASE,
						PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
					}
				}, '[db][query] error');
				console.error('[db][query] error', err, sql, params);
				throw err;
			}
		},
		async tx<T>(fn: (txDb: DbPort) => Promise<T>): Promise<T> {
			let client;
			try {
				client = await pool.connect();
			} catch (err) {
				const dbDiag = databaseUrlDiagnostics();
				logger.error({
					err,
					...dbDiag,
					db_env: {
						PGHOST: process.env.PGHOST,
						PGPORT: process.env.PGPORT,
						PGUSER: process.env.PGUSER,
						PGDATABASE: process.env.PGDATABASE,
						PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
					}
				}, '[db][tx] failed to connect');
				console.error('[db][tx] failed to connect', err);
				throw err;
			}
			try {
				await client.query('BEGIN');
				const integratorDrizzle = drizzle(client, { schema: integratorDrizzleSchema });
				const txPort: DbPort = {
					integratorDrizzle,
					query: async <Row = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<Row>> => {
						try {
							const res = await client.query(sql, params);
							return {
								rows: res.rows as Row[],
								...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
							};
						} catch (err) {
							const dbDiag = databaseUrlDiagnostics();
							logger.error({
								err,
								sql,
								params,
								...dbDiag,
								db_env: {
									PGHOST: process.env.PGHOST,
									PGPORT: process.env.PGPORT,
									PGUSER: process.env.PGUSER,
									PGDATABASE: process.env.PGDATABASE,
									PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
								}
							}, '[db][tx][query] error');
							console.error('[db][tx][query] error', err, sql, params);
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
				const dbDiag = databaseUrlDiagnostics();
				logger.error({
					err,
					...dbDiag,
					db_env: {
						PGHOST: process.env.PGHOST,
						PGPORT: process.env.PGPORT,
						PGUSER: process.env.PGUSER,
						PGDATABASE: process.env.PGDATABASE,
						PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
					}
				}, '[db][tx] error, rolled back');
				console.error('[db][tx] error, rolled back', err);
				throw err;
			} finally {
				client.release();
			}
		},
	};
}

/** Проверяет доступность БД коротким health-запросом. */
export async function healthCheckDb(): Promise<boolean> {
	try {
		const res = await db.query('SELECT 1');
		return res.rowCount === 1;
	} catch {
		return false;
	}
}

export async function closeDb(): Promise<void> {
  await db.end();
}
