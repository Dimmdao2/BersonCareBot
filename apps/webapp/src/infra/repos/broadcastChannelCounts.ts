/**
 * Read-only aggregation: count users with each broadcast channel connected.
 * Used for channel tiles in the broadcast form.
 * Wave 3 phase 15G — migrated from pool.query to Drizzle db.execute(sql).
 * Этап 4a (2026-06-13) — добавлены реальные счётчики telegram/max/push/email.
 * Весь SQL — Drizzle db.execute(sql`...`), pool.query/client.query не используются.
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from "@/modules/doctor-broadcasts/draftPort";

export function createPgBroadcastChannelCountsPort(): BroadcastChannelCountsPort {
  return {
    async getChannelConnectionCounts(): Promise<BroadcastChannelCounts> {
      const db = getDrizzle();
      const [tgResult, maxResult, smsResult, pushResult, emailResult] = await Promise.all([
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_channel_bindings
          WHERE channel_code = 'telegram'
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_channel_bindings
          WHERE channel_code = 'max'
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt
          FROM platform_users
          WHERE phone_normalized IS NOT NULL
            AND merged_into_id IS NULL
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_web_push_subscriptions
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt
          FROM platform_users
          WHERE email_verified_at IS NOT NULL
            AND email_normalized IS NOT NULL
            AND merged_into_id IS NULL
        `),
      ]);

      const parse = (r: { rows: unknown[] }) =>
        parseInt(((r.rows[0] as { cnt: string } | undefined)?.cnt ?? "0"), 10);

      const telegram = parse(tgResult);
      const max = parse(maxResult);
      const sms = parse(smsResult);
      const push = parse(pushResult);
      const email = parse(emailResult);

      return {
        bot_message: telegram, // legacy alias
        telegram,
        max,
        sms,
        push,
        email,
      };
    },
  };
}
