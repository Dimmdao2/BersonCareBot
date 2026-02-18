import { Pool } from 'pg';
import fetch from 'node-fetch';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const TELEGRAM_API = `https://api.telegram.org/bot${env.BOT_TOKEN}`;
const RATE_LIMIT_MS = 40;
const MAX_RETRIES = 3;

async function getActiveMailings() {
  const res = await pool.query('SELECT * FROM mailings');
  return res.rows;
}

async function getActiveUsersForMailing(mailingId: number) {
  const res = await pool.query(`
    SELECT u.* FROM users u
    JOIN user_subscriptions s ON s.user_id = u.id
    WHERE s.mailing_id = $1 AND s.is_active = true AND u.is_active IS DISTINCT FROM false
  `, [mailingId]);
  return res.rows;
}

async function markUserInactive(userId: number) {
  await pool.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);
}

async function logMailingResult(userId: number, mailingId: number, status: string, error?: string | undefined) {
  await pool.query(
    `INSERT INTO mailing_logs (user_id, mailing_id, status, sent_at, error)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (user_id, mailing_id) DO UPDATE SET status = $3, sent_at = NOW(), error = $4`,
    [userId, mailingId, status, error || null]
  );
}

async function wasMailingSent(userId: number, mailingId: number) {
  const res = await pool.query(
    'SELECT 1 FROM mailing_logs WHERE user_id = $1 AND mailing_id = $2 AND status = $3',
    [userId, mailingId, 'sent']
  );
  return (res.rowCount ?? 0) > 0;
}

async function sendTelegramMessage(chatId: number, text: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (res.ok) return true;
    const data = await res.json().catch(() => ({}));
    let errorMsg: string | undefined = undefined;
    if (typeof data === 'object' && data && 'description' in data && typeof (data as { description?: string }).description === 'string') {
      errorMsg = (data as { description?: string }).description;
    }
    if (res.status === 403) throw new Error('blocked');
    if (attempt === MAX_RETRIES) throw new Error(errorMsg || 'send failed');
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
}

export async function runMailings() {
  const mailings = await getActiveMailings();
  for (const mailing of mailings) {
    const users = await getActiveUsersForMailing(mailing.id);
    for (const user of users) {
      if (await wasMailingSent(user.id, mailing.id)) continue;
      try {
        await sendTelegramMessage(user.telegram_id, mailing.title);
        await logMailingResult(user.id, mailing.id, 'sent');
        logger.info({ user_id: user.id, mailing_id: mailing.id }, 'Mailing sent');
      } catch (err: unknown) {
        const message = typeof err === 'object' && err && 'message' in err && typeof (err as { message?: string }).message === 'string'
          ? (err as { message?: string }).message
          : undefined;
        if (message === 'blocked') {
          await markUserInactive(user.id);
          logger.warn({ user_id: user.id }, 'User blocked bot, marked inactive');
        }
        await logMailingResult(user.id, mailing.id, 'error', message);
        logger.error({
          user_id: user.id,
          mailing_id: mailing.id,
          error: typeof err === 'object' && err && 'message' in err && typeof (err as { message?: string }).message === 'string'
            ? (err as { message?: string }).message
            : undefined,
        }, 'Mailing failed');
      }
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }
}

if (require.main === module) {
  runMailings().then(() => process.exit(0)).catch(e => { logger.error(e); process.exit(1); });
}
