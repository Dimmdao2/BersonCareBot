/**
 * Read-only aggregation: count users with each broadcast channel connected.
 * Used for channel tiles in the broadcast form.
 * Wave 3 phase 15G — migrated from pool.query to Drizzle db.execute(sql).
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
      const [tgResult, smsResult] = await Promise.all([
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(DISTINCT user_id)::text AS cnt
          FROM user_channel_bindings
          WHERE channel_code = 'telegram'
        `),
        db.execute<{ cnt: string }>(sql`
          SELECT COUNT(*)::text AS cnt
          FROM platform_users
          WHERE phone_normalized IS NOT NULL
        `),
      ]);

      return {
        bot_message: parseInt(
          (tgResult.rows[0] as { cnt: string } | undefined)?.cnt ?? "0",
          10,
        ),
        sms: parseInt(
          (smsResult.rows[0] as { cnt: string } | undefined)?.cnt ?? "0",
          10,
        ),
        push: 0,
      };
    },
  };
}
