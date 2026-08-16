import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type {
  IntegratorWebPushDeliveryPort,
  IntegratorWebPushDeliverySettings,
  WebPushSubscriptionPayloadV1,
} from '@/modules/web-push/ports';

type SubscriptionRootPayload = {
  ok?: unknown;
  code?: unknown;
  subscriptions?: unknown;
};

type SettingsRootPayload = {
  ok?: unknown;
  web_push_vapid?: unknown;
  vapid_subject?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSubscription(value: unknown): WebPushSubscriptionPayloadV1 | null {
  const row = asRecord(value);
  if (!row) return null;
  const endpoint = typeof row.endpoint === 'string' ? row.endpoint.trim() : '';
  const p256dh = typeof row.p256dh === 'string' ? row.p256dh.trim() : '';
  const auth = typeof row.auth === 'string' ? row.auth.trim() : '';
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, expirationTime: null, keys: { p256dh, auth } };
}

export function createPgIntegratorWebPushDeliveryPort(): IntegratorWebPushDeliveryPort {
  return {
    async listAuthorizedSubscriptions(organizationId, userId) {
      const result = await runWebappNamedRoot<{ payload: SubscriptionRootPayload | null }>(
        getWebappSqlDb(),
        'app.read_integrator_web_push_subscriptions(uuid,uuid)',
        [organizationId, userId],
        sql`SELECT app.read_integrator_web_push_subscriptions(
          ${organizationId}::uuid,
          ${userId}::uuid
        ) AS payload`,
      );
      const payload = asRecord(result.rows[0]?.payload);
      if (payload?.ok !== true) return null;
      const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
      return subscriptions
        .map(parseSubscription)
        .filter((item): item is WebPushSubscriptionPayloadV1 => item !== null);
    },

    async readDeliverySettings(organizationId) {
      const result = await runWebappNamedRoot<{ payload: SettingsRootPayload | null }>(
        getWebappSqlDb(),
        'app.read_integrator_web_push_delivery_settings(uuid)',
        [organizationId],
        sql`SELECT app.read_integrator_web_push_delivery_settings(
          ${organizationId}::uuid
        ) AS payload`,
      );
      const payload = asRecord(result.rows[0]?.payload);
      if (payload?.ok !== true) return null;
      return {
        webPushVapidValueJson: payload.web_push_vapid ?? null,
        vapidSubject: typeof payload.vapid_subject === 'string' ? payload.vapid_subject : null,
      } satisfies IntegratorWebPushDeliverySettings;
    },
  };
}
