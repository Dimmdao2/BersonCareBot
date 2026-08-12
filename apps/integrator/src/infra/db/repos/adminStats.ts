import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

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
  try {
    const res = await runIntegratorSql<{ cnt: number }>(
      db,
      sql`SELECT COUNT(*)::int AS cnt
          FROM public.appointment_records
          WHERE status IN ('created', 'updated')
            AND deleted_at IS NULL
            AND (record_at IS NULL OR record_at >= now())`,
    );
    return res.rows[0]?.cnt ?? 0;
  } catch (err) {
    logger.error({ err }, 'get active bookings count failed');
    return 0;
  }
}

async function getUserCountsByIntegration(
  db: DbPort,
): Promise<AdminStats['userCountsByIntegration']> {
  const result: AdminStats['userCountsByIntegration'] = {};

  // Telegram: canonical channel bindings; phone lives on the bound platform user.
  try {
    const telegramRes = await runIntegratorSql<{ total: number; with_phone: number }>(
      db,
      sql`SELECT
            COUNT(DISTINCT binding.user_id)::int AS total,
            COUNT(DISTINCT binding.user_id) FILTER (
              WHERE user_row.phone_normalized IS NOT NULL
                AND TRIM(user_row.phone_normalized) != ''
            )::int AS with_phone
          FROM public.user_channel_bindings binding
          JOIN public.platform_users user_row ON user_row.id = binding.user_id
          WHERE binding.channel_code = 'telegram'
            AND user_row.merged_into_id IS NULL`,
    );
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

  return result;
}
