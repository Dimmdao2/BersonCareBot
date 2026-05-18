/**
 * Web Push: browser subscriptions (public schema) + server-side send via VAPID in `system_settings`.
 *
 * Patient API: subscribe/unsubscribe + status. Integrator M2M: reminder fan-out to push/email.
 */

/** Serialized `PushSubscriptionJSON` keys as stored for a user. */
export type WebPushSubscriptionKeysV1 = {
  p256dh: string;
  auth: string;
};

export type WebPushSubscriptionPayloadV1 = {
  endpoint: string;
  expirationTime: number | null;
  keys: WebPushSubscriptionKeysV1;
};

export type WebPushSubscriptionsPort = {
  /** Upsert by endpoint; trims subscriptions to max per user (oldest dropped). */
  saveSubscription(
    userId: string,
    subscription: WebPushSubscriptionPayloadV1,
    options?: { userAgent?: string | null },
  ): Promise<void>;
  removeSubscriptionByEndpoint(userId: string, endpoint: string): Promise<void>;
  removeSubscriptionsForUser(userId: string): Promise<void>;
  hasAnyForUserId(userId: string): Promise<boolean>;
  listActiveByUserId(userId: string): Promise<WebPushSubscriptionPayloadV1[]>;
  /** Remove stale subscription after 410/404 from push service; returns whether a row was removed. */
  deleteByEndpointIfExists(endpoint: string): Promise<boolean>;
};
