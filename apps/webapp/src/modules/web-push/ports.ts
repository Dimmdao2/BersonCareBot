/**
 * Future Web Push (browser subscriptions + server-side send). No adapter in `buildAppDeps` yet.
 * Status probe: `GET /api/patient/web-push/status` → **501** `not_implemented` until backlog ships.
 */

/** Serialized `PushSubscriptionJSON` keys as stored for a user (future). */
export type WebPushSubscriptionKeysV1 = {
  p256dh: string;
  auth: string;
};

export type WebPushSubscriptionPayloadV1 = {
  endpoint: string;
  expirationTime: number | null;
  keys: WebPushSubscriptionKeysV1;
};

/**
 * Port for persisting subscriptions and sending payloads (implement when product backlog clears).
 * Keep business logic in `modules/web-push/service.ts` (future), DB in `infra/repos` (future).
 */
export type WebPushSubscriptionsPort = {
  saveSubscription(userId: string, subscription: WebPushSubscriptionPayloadV1): Promise<void>;
  removeSubscriptionsForUser(userId: string): Promise<void>;
};
