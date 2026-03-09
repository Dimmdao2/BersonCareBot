
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';
import { logger } from '../observability/logger.js';


/** Общий пул подключений к PostgreSQL. */
export const db = new Pool({
	connectionString: env.DATABASE_URL,
});

db.on('error', (err) => {
	logger.error({
		err,
		connectionString: env.DATABASE_URL,
		db_env: {
			PGHOST: process.env.PGHOST,
			PGPORT: process.env.PGPORT,
			PGUSER: process.env.PGUSER,
			PGDATABASE: process.env.PGDATABASE,
			PGPASSWORD: process.env.PGPASSWORD ? '[set]' : undefined,
		}
	}, '[db][pool] connection error');
	console.error('[db][pool] connection error', err, {
		connectionString: env.DATABASE_URL,
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
				logger.error({
					err,
					sql,
					params,
					connectionString: env.DATABASE_URL,
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
				logger.error({
					err,
					connectionString: env.DATABASE_URL,
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
				const txPort: DbPort = {
					query: async <Row = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<Row>> => {
						try {
							const res = await client.query(sql, params);
							return {
								rows: res.rows as Row[],
								...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
							};
						} catch (err) {
							logger.error({
								err,
								sql,
								params,
								connectionString: env.DATABASE_URL,
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
				logger.error({
					err,
					connectionString: env.DATABASE_URL,
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
