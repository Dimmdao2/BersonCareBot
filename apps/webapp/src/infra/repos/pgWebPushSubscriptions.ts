import { getPool } from "@/infra/db/client";
import type { WebPushSubscriptionPayloadV1, WebPushSubscriptionsPort } from "@/modules/web-push/ports";

const MAX_SUBSCRIPTIONS_PER_USER = 5;

function rowToPayload(row: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): WebPushSubscriptionPayloadV1 {
  return {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  };
}

export function createPgWebPushSubscriptionsPort(): WebPushSubscriptionsPort {
  return {
    async saveSubscription(userId, subscription, options?: { userAgent?: string | null }) {
      const pool = getPool();
      const client = await pool.connect();
      const ua = options?.userAgent?.trim() || null;
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO user_web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5, now())
           ON CONFLICT (endpoint) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth,
             user_agent = EXCLUDED.user_agent,
             updated_at = now()`,
          [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, ua],
        );
        await client.query(
          `DELETE FROM user_web_push_subscriptions u
           WHERE u.user_id = $1::uuid
             AND u.id NOT IN (
               SELECT id FROM user_web_push_subscriptions
               WHERE user_id = $1::uuid
               ORDER BY updated_at DESC, created_at DESC
               LIMIT $2
             )`,
          [userId, MAX_SUBSCRIPTIONS_PER_USER],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },

    async removeSubscriptionByEndpoint(userId, endpoint) {
      const pool = getPool();
      await pool.query(`DELETE FROM user_web_push_subscriptions WHERE user_id = $1::uuid AND endpoint = $2`, [
        userId,
        endpoint,
      ]);
    },

    async removeSubscriptionsForUser(userId) {
      const pool = getPool();
      await pool.query(`DELETE FROM user_web_push_subscriptions WHERE user_id = $1::uuid`, [userId]);
    },

    async hasAnyForUserId(userId) {
      const pool = getPool();
      const res = await pool.query(
        `SELECT 1 FROM user_web_push_subscriptions WHERE user_id = $1::uuid LIMIT 1`,
        [userId],
      );
      return res.rows.length > 0;
    },

    async listActiveByUserId(userId) {
      const pool = getPool();
      const res = await pool.query<{ endpoint: string; p256dh: string; auth: string }>(
        `SELECT endpoint, p256dh, auth FROM user_web_push_subscriptions WHERE user_id = $1::uuid`,
        [userId],
      );
      return res.rows.map(rowToPayload);
    },

    async deleteByEndpointIfExists(endpoint: string): Promise<boolean> {
      const pool = getPool();
      const res = await pool.query(`DELETE FROM user_web_push_subscriptions WHERE endpoint = $1`, [endpoint]);
      return (res.rowCount ?? 0) > 0;
    },
  };
}
