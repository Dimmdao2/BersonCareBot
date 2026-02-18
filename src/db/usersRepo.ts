import { Pool } from 'pg';
import { logger } from '../logger.js';
import { env } from '../config/env.js';

const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function upsertUser({ telegram_id, username, first_name, last_name, phone, _language_code }: {
  telegram_id: number;
  username?: string | undefined;
  first_name?: string | undefined;
  last_name?: string | undefined;
  phone?: string | undefined;
  _language_code?: string | undefined;
}) {
  const res = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, last_name, phone, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (telegram_id) DO UPDATE SET
       username=EXCLUDED.username,
       first_name=EXCLUDED.first_name,
       last_name=EXCLUDED.last_name,
       phone=EXCLUDED.phone,
       updated_at=NOW()
     RETURNING *`,
    [telegram_id, username, first_name, last_name, phone]
  );
  logger.info({ user: res.rows[0] }, 'User upserted');
  return res.rows[0];
}
