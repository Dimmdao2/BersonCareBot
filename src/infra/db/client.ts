import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { env } from '../../config/env.js';

/** Общий пул подключений к PostgreSQL. */
export const db = new Pool({
	connectionString: env.DATABASE_URL,
});

export function createDbPort(pool: Pool = db): DbPort {
	return {
		async query<T = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>> {
			const res = await pool.query(sql, params);
			return {
				rows: res.rows as T[],
				...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
			};
		},
		async tx<T>(fn: (txDb: DbPort) => Promise<T>): Promise<T> {
			const client = await pool.connect();
			try {
				await client.query('BEGIN');
				const txPort: DbPort = {
					query: async <Row = QueryResultRow>(sql: string, params?: unknown[]): Promise<DbQueryResult<Row>> => {
						const res = await client.query(sql, params);
						return {
							rows: res.rows as Row[],
							...(typeof res.rowCount === 'number' ? { rowCount: res.rowCount } : {}),
						};
					},
					tx: async <Row>(nested: (inner: DbPort) => Promise<Row>): Promise<Row> => nested(txPort),
				};
				const result = await fn(txPort);
				await client.query('COMMIT');
				return result;
			} catch (err) {
				await client.query('ROLLBACK');
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
