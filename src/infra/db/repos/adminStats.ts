import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

export type AdminStats = {
  activeBookings: number;
  userCountsByIntegration: {
    telegram?: { total: number; withPhone: number };
    [key: string]: { total: number; withPhone?: number } | undefined;
  };
};

/** Returns admin dashboard stats: active bookings count and user counts per integration. */
export async function getAdminStats(db: DbPort): Promise<AdminStats> {
  const activeBookings = await getActiveBookingsCount(db);
  const userCountsByIntegration = await getUserCountsByIntegration(db);
  return { activeBookings, userCountsByIntegration };
}

async function getActiveBookingsCount(db: DbPort): Promise<number> {
  const query = `
    SELECT COUNT(*)::int AS cnt
    FROM rubitime_records
    WHERE status IN ('created', 'updated')
  `;
  try {
    const res = await db.query<{ cnt: number }>(query);
    return res.rows[0]?.cnt ?? 0;
  } catch (err) {
    logger.error({ err }, 'get active bookings count failed');
    return 0;
  }
}

async function getUserCountsByIntegration(db: DbPort): Promise<AdminStats['userCountsByIntegration']> {
  const result: AdminStats['userCountsByIntegration'] = {};

  // Telegram: total identities, and those with phone (via contacts)
  const telegramQuery = `
    WITH telegram_users AS (
      SELECT i.user_id
      FROM identities i
      WHERE i.resource = 'telegram'
    ),
    with_phone AS (
      SELECT COUNT(DISTINCT c.user_id)::int AS cnt
      FROM contacts c
      WHERE c.type = 'phone'
        AND c.user_id IN (SELECT user_id FROM telegram_users)
    )
    SELECT
      (SELECT COUNT(*)::int FROM telegram_users) AS total,
      (SELECT cnt FROM with_phone) AS with_phone
  `;
  try {
    const res = await db.query<{ total: number; with_phone: number }>(telegramQuery);
    const row = res.rows[0];
    if (row) {
      result.telegram = {
        total: row.total ?? 0,
        withPhone: row.with_phone ?? 0,
      };
    }
  } catch (err) {
    logger.error({ err }, 'get telegram user counts failed');
  }

  return result;
}
