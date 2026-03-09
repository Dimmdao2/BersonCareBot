import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';

export type AdminStats = {
  activeBookings: number;
  userCountsByIntegration: {
    telegram?: { total: number; withPhone: number };
    rubitime?: { total: number };
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

  // Telegram: legacy telegram_users (основной источник), with phone из telegram_users.phone
  try {
    const telegramRes = await db.query<{ total: number; with_phone: number }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE phone IS NOT NULL AND TRIM(phone) != '')::int AS with_phone
      FROM telegram_users
    `);
    const row = telegramRes.rows[0];
    if (row) {
      result.telegram = {
        total: row.total ?? 0,
        withPhone: row.with_phone ?? 0,
      };
    }
  } catch (err) {
    logger.error({ err }, 'get telegram user counts failed');
  }

  // RubiTime: уникальные телефоны в rubitime_records
  try {
    const rubitimeRes = await db.query<{ cnt: number }>(`
      SELECT COUNT(DISTINCT phone_normalized)::int AS cnt
      FROM rubitime_records
      WHERE phone_normalized IS NOT NULL AND TRIM(phone_normalized) != ''
    `);
    const row = rubitimeRes.rows[0];
    if (row != null) {
      result.rubitime = { total: row.cnt ?? 0 };
    }
  } catch (err) {
    logger.error({ err }, 'get rubitime user counts failed');
  }

  return result;
}
