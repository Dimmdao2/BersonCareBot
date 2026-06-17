import { logger } from "@/app-layer/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { StaffUsersPort } from "@/modules/doctor-notifications/staffUsersPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";

export type AdminIncidentStaffPushDeps = {
  staffUsers: StaffUsersPort;
  channelPreferences: ChannelPreferencesPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
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
  const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
  if (!vapid) {
    logger.info({ scope: "admin_incident", event: "admin_incident_alert_skipped_no_vapid", channel: "web_push" });
    return 0;
  }

  const staffIds = await deps.staffUsers.listActiveStaffUserIds();
  if (staffIds.length === 0) return 0;

  const { sendWebPushToSubscriptions } = await import("@/modules/web-push/sendWebPushToSubscriptions");
  const { smtpInnerFromValueJson } = await import("@/modules/system-settings/smtpOutboundPatch");
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const vapidSubject =
    smtpParsed?.success === true && smtpParsed.data.from.includes("@")
      ? `mailto:${smtpParsed.data.from}`
      : "mailto:noreply@invalid";

  let delivered = 0;

  for (const userId of staffIds) {
    const [prefs, subs] = await Promise.all([
      deps.channelPreferences.getPreferences(userId),
      deps.webPushSubscriptions.listActiveByUserId(userId),
    ]);
    const globalWebPushEnabled =
      prefs.find((p) => p.channelCode === "web_push")?.isEnabledForNotifications !== false;
    if (!globalWebPushEnabled || subs.length === 0) continue;

    const pushResult = await sendWebPushToSubscriptions({
      subscriptions: subs,
      vapidPublicKey: vapid.publicKey,
      vapidPrivateKey: vapid.privateKey,
      vapidSubject,
      payload: {
        title: input.pushTitle,
        body: input.pushBody,
        url: input.pushUrl,
        tag: `admin-incident:${input.topic}:${input.dedupKey}`,
      },
      onSubscriptionDead: async (endpoint) => {
        await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
      },
      logContext: { userId, topicCode: input.topic },
    }).catch((err: unknown) => {
      logger.warn({ err, userId, topic: input.topic }, "admin incident staff web push failed");
      return { delivered: 0, errors: 1, deactivated: 0 };
    });
    delivered += pushResult.delivered;
  }

  return delivered;
}
