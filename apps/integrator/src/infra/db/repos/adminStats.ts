import { sql } from 'drizzle-orm';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { logger } from '../../observability/logger.js';
import { runIntegratorNamedRoot, runIntegratorSql } from '../runIntegratorSql.js';

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
  const res = await runIntegratorNamedRoot<{ cnt: number }>(
    db,
    'app.count_active_canonical_appointments()',
    [],
    sql`SELECT app.count_active_canonical_appointments()::int AS cnt`,
  );
  return res.rows[0]?.cnt ?? 0;
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
              WHERE EXISTS (
                SELECT 1 FROM public.user_contacts contact
                WHERE contact.platform_user_id = user_row.id
                  AND contact.contact_kind = 'phone' AND contact.is_primary = true
                  AND TRIM(contact.value_normalized) != ''
              )
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
