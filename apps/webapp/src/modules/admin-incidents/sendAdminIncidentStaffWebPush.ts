/**
 * CANARY MIGRATION (P18 — PLAN S14a).
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * this function now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` handles the actual send, covered by the
 * pre-fork redirect chokepoint (G1). G2 guard in `sendWebPushToSubscriptions.ts` is
 * kept intact — it still protects the other 6 un-migrated legs (S14b–S14g).
 *
 * Channel-preference + subscription existence pre-check is still performed in the webapp
 * to avoid unnecessary relay calls for staff who have web_push disabled or no subscriptions.
 *
 * systemSettings dep is kept in the type for backward compat with call sites that build
 * AdminIncidentStaffPushDeps; it is no longer used by this function (VAPID is now read
 * by the integrator adapter at send time, not here).
 */
import { logger } from "@/app-layer/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { StaffUsersPort } from "@/modules/doctor-notifications/staffUsersPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { relayOutbound } from "@/modules/messaging/relayOutbound";

export type AdminIncidentStaffPushDeps = {
  staffUsers: StaffUsersPort;
  channelPreferences: ChannelPreferencesPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  /** Kept for call-site compat. No longer used; VAPID is read by the integrator adapter. */
  systemSettings: Pick<SystemSettingsService, "getSetting">;
};

export async function sendAdminIncidentStaffWebPush(
  input: {
    topic: string;
    dedupKey: string;
    pushTitle: string;
    pushBody: string;
    pushUrl: string;
  },
  deps: AdminIncidentStaffPushDeps,
): Promise<number> {
  const staffIds = await deps.staffUsers.listActiveStaffUserIds();
  if (staffIds.length === 0) return 0;

  let dispatched = 0;

  for (const userId of staffIds) {
    const [prefs, hasSubs] = await Promise.all([
      deps.channelPreferences.getPreferences(userId),
      deps.webPushSubscriptions.hasAnyForUserId(userId),
    ]);

    const globalWebPushEnabled =
      prefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;

    if (!globalWebPushEnabled || !hasSubs) continue;

    // Emit a web_push intent to the integrator via relay-outbound.
    // The integrator's WebPushDeliveryAdapter (S14a) performs the actual send.
    // In dev (DEV_DELIVERY_REDIRECT=1), the pre-fork redirect collapses to the
    // telegram test chat — ZERO real webpush.sendNotification calls.
    const tag = `admin-incident:${input.topic}:${input.dedupKey}`;
    const result = await relayOutbound({
      messageId: `admin-incident-push:${userId}:${tag}`,
      channel: "web_push",
      recipient: userId,
      text: input.pushBody,
      metadata: {
        title: input.pushTitle,
        url: input.pushUrl,
        pushExtras: { tag },
      },
    }).catch((err: unknown) => {
      logger.warn(
        { err, userId, topic: input.topic },
        "admin incident staff web push relay failed",
      );
      return { ok: false as const, reason: "relay_error" };
    });

    if (result.ok) {
      dispatched += 1;
    }
  }

  return dispatched;
}
