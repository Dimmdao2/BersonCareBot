import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  aggregateReminderPeopleChannelSegments,
  type ReminderPeopleWithNotificationsStats,
} from "@/app-layer/stats/reminderNotificationPeopleShared";

export type { ReminderPeopleWithNotificationsStats } from "@/app-layer/stats/reminderNotificationPeopleShared";

type DailyRow = { bucket: string; peopleCount: unknown };
type ChannelFlagsRow = {
  hasPush: boolean;
  hasTelegram: boolean;
  hasMax: boolean;
};

/**
 * People with ≥1 enabled `reminder_rules` row (dedup by platform user).
 * Daily series: cumulative count by first `created_at` among currently enabled rules.
 * Channel pie: mutually exclusive segments (Push / Telegram / MAX only).
 */
export async function loadReminderPeopleWithNotificationsStats(opts: {
  windowHours: number;
  displayTimezone: string;
}): Promise<ReminderPeopleWithNotificationsStats> {
  const windowHours = opts.windowHours;
  const iana = opts.displayTimezone;
  const ianaSql = sql`${iana}::text`;
  const db = getDrizzle();

  const [dailyRows, channelRows, currentRow] = await Promise.all([
    db.execute<DailyRow>(sql`
      WITH enabled_users AS (
        SELECT
          COALESCE(rr.platform_user_id, pu.id) AS platform_user_id,
          MIN(rr.created_at::timestamptz) AS cohort_at
        FROM reminder_rules rr
        LEFT JOIN platform_users pu
          ON pu.integrator_user_id = rr.integrator_user_id
         AND rr.platform_user_id IS NULL
        WHERE rr.is_enabled = TRUE
          AND COALESCE(rr.platform_user_id, pu.id) IS NOT NULL
        GROUP BY 1
      ),
      day_series AS (
        SELECT generate_series(
          date_trunc(
            'day',
            timezone(${ianaSql}, now()) - (${windowHours}::integer * interval '1 hour')
          ),
          date_trunc('day', timezone(${ianaSql}, now())),
          interval '1 day'
        ) AS day_bucket
      )
      SELECT
        ds.day_bucket::text AS bucket,
        COUNT(eu.platform_user_id)::int AS "peopleCount"
      FROM day_series ds
      LEFT JOIN enabled_users eu ON date_trunc('day', timezone(${ianaSql}, eu.cohort_at)) <= ds.day_bucket
      GROUP BY ds.day_bucket
      ORDER BY ds.day_bucket
    `),
    db.execute<ChannelFlagsRow>(sql`
      WITH reminded AS (
        SELECT DISTINCT COALESCE(rr.platform_user_id, pu.id) AS platform_user_id
        FROM reminder_rules rr
        LEFT JOIN platform_users pu
          ON pu.integrator_user_id = rr.integrator_user_id
         AND rr.platform_user_id IS NULL
        WHERE rr.is_enabled = TRUE
          AND COALESCE(rr.platform_user_id, pu.id) IS NOT NULL
      )
      SELECT
        EXISTS (
          SELECT 1
          FROM user_web_push_subscriptions wps
          WHERE wps.user_id = r.platform_user_id
            AND NOT EXISTS (
              SELECT 1
              FROM user_channel_preferences ucp
              WHERE ucp.platform_user_id = r.platform_user_id
                AND ucp.channel_code = 'web_push'
                AND ucp.is_enabled_for_notifications = FALSE
            )
        ) AS "hasPush",
        EXISTS (
          SELECT 1
          FROM user_channel_bindings ucb
          WHERE ucb.user_id = r.platform_user_id
            AND ucb.channel_code = 'telegram'
            AND NOT EXISTS (
              SELECT 1
              FROM user_channel_preferences ucp
              WHERE ucp.platform_user_id = r.platform_user_id
                AND ucp.channel_code = 'telegram'
                AND ucp.is_enabled_for_notifications = FALSE
            )
        ) AS "hasTelegram",
        EXISTS (
          SELECT 1
          FROM user_channel_bindings ucb
          WHERE ucb.user_id = r.platform_user_id
            AND ucb.channel_code = 'max'
            AND NOT EXISTS (
              SELECT 1
              FROM user_channel_preferences ucp
              WHERE ucp.platform_user_id = r.platform_user_id
                AND ucp.channel_code = 'max'
                AND ucp.is_enabled_for_notifications = FALSE
            )
        ) AS "hasMax"
      FROM reminded r
    `),
    db.execute<{ peopleCount: unknown }>(sql`
      SELECT COUNT(DISTINCT COALESCE(rr.platform_user_id, pu.id))::int AS "peopleCount"
      FROM reminder_rules rr
      LEFT JOIN platform_users pu
        ON pu.integrator_user_id = rr.integrator_user_id
       AND rr.platform_user_id IS NULL
      WHERE rr.is_enabled = TRUE
        AND COALESCE(rr.platform_user_id, pu.id) IS NOT NULL
    `),
  ]);

  const daily = dailyRows.rows.map((r) => ({
    bucket: String(r.bucket),
    peopleCount: Number(r.peopleCount ?? 0),
  }));

  const channelSegmentsToday = aggregateReminderPeopleChannelSegments(
    channelRows.rows.map((r) => ({
      hasPush: Boolean(r.hasPush),
      hasTelegram: Boolean(r.hasTelegram),
      hasMax: Boolean(r.hasMax),
    })),
  );

  const currentPeopleCount = Number(currentRow.rows[0]?.peopleCount ?? 0);

  return {
    currentPeopleCount,
    daily,
    channelSegmentsToday,
  };
}
