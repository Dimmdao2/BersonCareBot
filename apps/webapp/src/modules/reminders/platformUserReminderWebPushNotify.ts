import { logger } from "@/infra/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { smtpInnerFromValueJson } from "@/modules/outbound-email/sendTransactionalSmtp";
import type { NotificationDeliveryService } from "@/modules/notification-delivery/service";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";

const PATIENT_REMINDER_INTENT_TYPE = "patient_reminder";

export type PlatformUserReminderWebPushNotifyDeps = {
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
  notificationDelivery?: NotificationDeliveryService;
};

export type PlatformUserReminderWebPushNotifyInput = {
  platformUserId: string;
  occurrenceId: string;
  topicCode: string;
  title: string;
  bodyText: string;
  openUrl: string;
};

export type PlatformUserReminderWebPushNotifyResult =
  | { ok: true; delivered: number; skipped?: string }
  | { ok: false; error: string };

function stripHtmlLight(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function runPlatformUserReminderWebPushNotify(
  input: PlatformUserReminderWebPushNotifyInput,
  deps: PlatformUserReminderWebPushNotifyDeps,
): Promise<PlatformUserReminderWebPushNotifyResult> {
  const gate = await deps.readReminderNotifyGate(input.platformUserId, input.topicCode);
  if (gate.muted) {
    return { ok: true, delivered: 0, skipped: "muted" };
  }
  if (!gate.topicMasterEnabled) {
    return { ok: true, delivered: 0, skipped: "topic_disabled" };
  }

  const prefs = await deps.channelPreferences.getPreferences(input.platformUserId);
  const topicRows = await deps.topicChannelPrefs.listByUserId(input.platformUserId);
  const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const subs = await deps.webPushSubscriptions.listActiveByUserId(input.platformUserId);

  const resolved = resolvePatientNotificationChannels({
    topicCode: input.topicCode,
    availability: {
      hasTelegram: false,
      hasMax: false,
      hasEmail: false,
      emailVerified: false,
      hasWebPushSubscription: subs.length > 0,
      vapidConfigured: Boolean(vapidKeys),
      smtpConfigured: smtpParsed?.success === true,
    },
    channelPrefs: prefs,
    topicChannelRows: topicRows,
    gate,
  });

  if (!resolved.selectedChannels.includes("web_push")) {
    const skip = resolved.skippedChannels.find((s) => s.channel === "web_push");
    return { ok: true, delivered: 0, skipped: skip?.reason ?? "web_push_not_selected" };
  }

  if (!vapidKeys) {
    await deps.notificationDelivery?.recordNotificationDeliveryAttempt({
      userId: input.platformUserId,
      topicCode: input.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: "web_push",
      status: "skipped",
      reason: "vapid_missing",
      occurrenceId: input.occurrenceId,
    });
    return { ok: true, delivered: 0, skipped: "vapid_missing" };
  }

  if (subs.length === 0) {
    await deps.notificationDelivery?.recordNotificationDeliveryAttempt({
      userId: input.platformUserId,
      topicCode: input.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: "web_push",
      status: "skipped",
      reason: "no_active_subscriptions",
      occurrenceId: input.occurrenceId,
    });
    return { ok: true, delivered: 0, skipped: "no_active_subscriptions" };
  }

  const title = stripHtmlLight(input.title).slice(0, 200);
  const textBody = stripHtmlLight(input.bodyText).slice(0, 500);
  const vapidSubject =
    smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
      `mailto:${smtpParsed.data.from}`
    : "mailto:noreply@invalid";

  const r = await sendWebPushToSubscriptions({
    subscriptions: subs,
    vapidPublicKey: vapidKeys.publicKey,
    vapidPrivateKey: vapidKeys.privateKey,
    vapidSubject,
    payload: {
      title: title || "Напоминание",
      body: textBody || title || "Напоминание",
      url: input.openUrl,
      tag: `reminder:${input.occurrenceId}`,
    },
    onSubscriptionDead: async (endpoint) => {
      await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
    },
    onAttempt: deps.notificationDelivery
      ? async (attempt) => {
          await deps.notificationDelivery!.recordNotificationDeliveryAttempt({
            userId: input.platformUserId,
            topicCode: input.topicCode,
            intentType: PATIENT_REMINDER_INTENT_TYPE,
            channel: "web_push",
            status: attempt.status,
            reason: attempt.reason,
            providerStatusCode: attempt.providerStatusCode,
            endpointHash: attempt.endpointHash,
            occurrenceId: input.occurrenceId,
            errorMessage: attempt.errorMessage,
          });
        }
      : undefined,
    logContext: {
      userId: input.platformUserId,
      topicCode: input.topicCode,
      occurrenceId: input.occurrenceId,
    },
  });

  logger.info(
    {
      event: "web_push_only_reminder.send_result",
      platformUserId: input.platformUserId,
      occurrenceId: input.occurrenceId,
      topicCode: input.topicCode,
      delivered: r.delivered,
      errors: r.errors,
    },
    "web push-only reminder send result",
  );

  if (r.delivered > 0) {
    return { ok: true, delivered: r.delivered };
  }
  return { ok: false, error: r.errors > 0 ? "web_push_errors" : "web_push_not_delivered" };
}
