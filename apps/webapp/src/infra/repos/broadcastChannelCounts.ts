/**
 * Read-only aggregation: count users with each broadcast channel connected.
 * Used for channel tiles in the broadcast form.
 */
import { getPool } from "@/infra/db/client";
import type {
  BroadcastChannelCounts,
  BroadcastChannelCountsPort,
} from "@/modules/doctor-broadcasts/draftPort";

export function createPgBroadcastChannelCountsPort(): BroadcastChannelCountsPort {
  const pool = getPool();

  return {
    async getChannelConnectionCounts(): Promise<BroadcastChannelCounts> {
      const [tgResult, smsResult] = await Promise.all([
        pool.query<{ cnt: string }>(
          `SELECT COUNT(DISTINCT user_id)::text AS cnt
           FROM user_channel_bindings
           WHERE channel_code = 'telegram'`,
        ),
        pool.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM platform_users
           WHERE phone_normalized IS NOT NULL`,
        ),
      ]);

      return {
        bot_message: parseInt(tgResult.rows[0]?.cnt ?? "0", 10),
        sms: parseInt(smsResult.rows[0]?.cnt ?? "0", 10),
        push: 0,
      };
    },
  };
}
