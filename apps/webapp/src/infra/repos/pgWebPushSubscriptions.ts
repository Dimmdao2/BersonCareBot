/**
 * Wave 3 phase 14D — domain SQL via `runWebappPgText`; Class C TX on `saveSubscription`.
 */
import { sql } from 'drizzle-orm';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { getPool } from '@/infra/db/client';
import {
  getWebappSqlDb,
  getWebappSqlFromPgClient,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import { withPoolTransaction } from '@/infra/db/withClient';
import type {
  WebPushSubscriptionPayloadV1,
  WebPushSubscriptionsPort,
} from '@/modules/web-push/ports';
import type { PoolClient } from 'pg';

const MAX_SUBSCRIPTIONS_PER_USER = 5;

function txPgText<T = unknown>(
  client: PoolClient,
  queryText: string,
  values: readonly unknown[] = [],
) {
  return runWebappPgText<T>(queryText, values, getWebappSqlFromPgClient(client));
}

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

async function removeCurrentPatientSubscription(endpoint: string): Promise<boolean> {
  const result = await runWebappNamedRoot<{ deleted: boolean }>(
    getWebappSqlDb(),
    'app.remove_current_patient_web_push_subscription(text)',
    [endpoint],
    sql`SELECT app.remove_current_patient_web_push_subscription(${endpoint}::text) AS deleted`,
  );
  return result.rows[0]?.deleted === true;
}

export function createPgWebPushSubscriptionsPort(): WebPushSubscriptionsPort {
  return {
    async saveSubscription(userId, subscription, options?: { userAgent?: string | null }) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        const userAgent = options?.userAgent?.trim() || null;
        const args = [
          subscription.endpoint,
          subscription.keys.p256dh,
          subscription.keys.auth,
          userAgent,
        ] as const;
        const result = await runWebappNamedRoot<{ saved: boolean }>(
          getWebappSqlDb(),
          'app.save_current_patient_web_push_subscription(text,text,text,text)',
          args,
          sql`SELECT app.save_current_patient_web_push_subscription(
            ${subscription.endpoint}::text,
            ${subscription.keys.p256dh}::text,
            ${subscription.keys.auth}::text,
            ${userAgent}::text
          ) AS saved`,
        );
        if (result.rows[0]?.saved !== true) throw new Error('web_push_subscription_rejected');
        return;
      }
      const pool = getPool();
      const ua = options?.userAgent?.trim() || null;
      await withPoolTransaction(pool, async (client) => {
        await txPgText(
          client,
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
        await txPgText(
          client,
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
      });
    },

    async removeSubscriptionByEndpoint(userId, endpoint) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await removeCurrentPatientSubscription(endpoint);
        return;
      }
      await runWebappPgText(
        `DELETE FROM user_web_push_subscriptions WHERE user_id = $1::uuid AND endpoint = $2`,
        [userId, endpoint],
      );
    },

    async removeSubscriptionsForUser(userId) {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        await runWebappNamedRoot(
          getWebappSqlDb(),
          'app.remove_all_current_patient_web_push_subscriptions()',
          [],
          sql`SELECT app.remove_all_current_patient_web_push_subscriptions() AS affected`,
        );
        return;
      }
      await runWebappPgText(`DELETE FROM user_web_push_subscriptions WHERE user_id = $1::uuid`, [
        userId,
      ]);
    },

    async hasAnyForUserId(userId) {
      const res = await runWebappPgText(
        `SELECT 1 FROM user_web_push_subscriptions WHERE user_id = $1::uuid LIMIT 1`,
        [userId],
      );
      return res.rows.length > 0;
    },

    async listActiveByUserId(userId) {
      const res = await runWebappPgText<{ endpoint: string; p256dh: string; auth: string }>(
        `SELECT endpoint, p256dh, auth FROM user_web_push_subscriptions WHERE user_id = $1::uuid`,
        [userId],
      );
      return res.rows.map(rowToPayload);
    },

    async deleteByEndpointIfExists(userId: string, endpoint: string): Promise<boolean> {
      if (getCurrentDbPrincipal()?.kind === 'patient') {
        return removeCurrentPatientSubscription(endpoint);
      }
      const res = await runWebappPgText(
        `DELETE FROM user_web_push_subscriptions WHERE user_id = $1::uuid AND endpoint = $2`,
        [userId, endpoint],
      );
      return (res.rowCount ?? 0) > 0;
    },
  };
}
