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
  deleteByEndpointIfExists(userId: string, endpoint: string): Promise<boolean>;
};

export type IntegratorWebPushDeliverySettings = {
  webPushVapidValueJson: unknown | null;
  /** Public VAPID contact, derived inside the DB seam without exposing SMTP credentials. */
  vapidSubject: string | null;
};

export type NativePushAppId = 'therapygo' | 'therapysto';
export type NativePushProvider = 'rustore' | 'fcm' | 'hms';
export type NativePushTokenCipher = import('./nativePush').NativePushTokenCipher;
export type NativePushTarget = { id: string; appId: NativePushAppId; provider: NativePushProvider; token: string };
export type NativePushTargetLifecyclePort = {
  register(input: { userId: string; appId: NativePushAppId; provider: NativePushProvider; installationId: string; token: string }): Promise<void>;
  revoke(userId: string, appId: NativePushAppId, provider: NativePushProvider, installationId: string): Promise<void>;
  listActive(userId: string, appId: NativePushAppId): Promise<NativePushTarget[]>;
  deactivateById(targetId: string): Promise<void>;
  activeOwnerId(targetId: string): Promise<string | null>;
  activeTarget(targetId: string): Promise<{ userId: string; appId: NativePushAppId } | null>;
  status(userId: string, appId: NativePushAppId): Promise<{ active: boolean; providers: NativePushProvider[] }>;
};

/** Narrow M2M reads used only after an integrator organization principal is installed. */
export type IntegratorWebPushDeliveryPort = {
  /** `null` means the target user is not active in the attested organization. */
  listAuthorizedSubscriptions(
    organizationId: string,
    userId: string,
  ): Promise<WebPushSubscriptionPayloadV1[] | null>;
  readDeliverySettings(organizationId: string): Promise<IntegratorWebPushDeliverySettings | null>;
  listAuthorizedNativeTargets(organizationId: string, userId: string, appId: NativePushAppId): Promise<NativePushTarget[] | null>;
  deactivateAuthorizedNativeTarget(organizationId: string, targetId: string): Promise<boolean | null>;
};
