/**
 * Read-only aggregation: count users with each broadcast channel connected.
 * Used for channel tiles in the broadcast form.
 * Wave 3 phase 15G — migrated from pool.query to Drizzle db.execute(sql).
 * Этап 4a (2026-06-13) — добавлены реальные счётчики telegram/max/push/email.
 * getChannelCountsByUserIds uses getPool() for array param binding (Drizzle ANY array workaround).
 */
import { sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getPool } from "@/infra/db/client";
import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from "@/modules/doctor-broadcasts/draftPort";

export function createPgBroadcastChannelCountsPort(): BroadcastChannelCountsPort {
  const parse = (r: { rows: unknown[] }) =>
    parseInt(((r.rows[0] as { cnt: string } | undefined)?.cnt ?? "0"), 10);

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

    async getChannelCountsByUserIds(userIds: readonly string[]): Promise<BroadcastChannelCounts> {
      if (userIds.length === 0) {
        return { bot_message: 0, telegram: 0, max: 0, sms: 0, push: 0, email: 0 };
      }
      const pool = getPool();
      const ids = [...userIds];
      const parsePool = (r: { rows: { cnt: string }[] }) =>
        parseInt(r.rows[0]?.cnt ?? "0", 10);
      const [tgResult, maxResult, smsResult, pushResult, emailResult] = await Promise.all([
        pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT user_id)::text AS cnt FROM user_channel_bindings WHERE channel_code = 'telegram' AND user_id = ANY($1::uuid[])`,
          [ids],
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT user_id)::text AS cnt FROM user_channel_bindings WHERE channel_code = 'max' AND user_id = ANY($1::uuid[])`,
          [ids],
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM platform_users WHERE id = ANY($1::uuid[]) AND phone_normalized IS NOT NULL AND merged_into_id IS NULL`,
          [ids],
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT user_id)::text AS cnt FROM user_web_push_subscriptions WHERE user_id = ANY($1::uuid[])`,
          [ids],
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM platform_users WHERE id = ANY($1::uuid[]) AND email_verified_at IS NOT NULL AND email_normalized IS NOT NULL AND merged_into_id IS NULL`,
          [ids],
        ),
      ]);

      const telegram = parsePool(tgResult);
      const max = parsePool(maxResult);
      const sms = parsePool(smsResult);
      const push = parsePool(pushResult);
      const email = parsePool(emailResult);

      return { bot_message: telegram, telegram, max, sms, push, email };
    },
  };
}
