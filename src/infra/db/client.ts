import { Pool } from 'pg';
import { env } from '../../config/env.js';

/** Общий пул подключений к PostgreSQL. */
export const db = new Pool({
	connectionString: env.DATABASE_URL,
});

/** Проверяет доступность БД коротким health-запросом. */
export async function healthCheckDb(): Promise<boolean> {
	try {
		const res = await db.query('SELECT 1');
		return res.rowCount === 1;
	} catch {
		return false;
	}
}
