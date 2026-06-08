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
import type { WarmupPushDynamicContext } from "@/modules/web-push/pushNotificationCopy";
import {
  createTrackedWebPushPayload,
  productAnalyticsMetadataFromPayload,
} from "@/app-layer/product-analytics/createTrackedWebPushPayload";
import {
  resolveReminderWebPushPayload,
  type ReminderWebPushPayload,
} from "@/modules/web-push/resolveReminderWebPushPayload";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";
import { isOperationalVerboseLogEnabled } from "@/modules/observability/operationalVerboseLog";

const PATIENT_REMINDER_INTENT_TYPE = "patient_reminder";

export type PlatformUserReminderWebPushNotifyDeps = {
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
  notificationDelivery?: NotificationDeliveryService;
};

export type ReminderWebPushRuleMeta = {
  linkedObjectType?: string | null;
  linkedObjectId?: string | null;
  reminderIntent?: string | null;
  occurrenceCategory?: string | null;
  customTitle?: string | null;
  customText?: string | null;
};

export type PlatformUserReminderWebPushNotifyInput = {
  platformUserId: string;
  occurrenceId: string;
  topicCode: string;
  openUrl: string;
  /** @deprecated Push copy is built from ruleMeta; kept for logging/email parity elsewhere. */
  title?: string;
  bodyText?: string;
  ruleMeta?: ReminderWebPushRuleMeta;
  warmupContext?: WarmupPushDynamicContext;
};

export type PlatformUserReminderWebPushNotifyResult =
  | { ok: true; delivered: number; skipped?: string }
  | { ok: false; error: string };

function stripHtmlLight(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function resolvePushPayload(input: PlatformUserReminderWebPushNotifyInput): ReminderWebPushPayload | null {
  if (input.ruleMeta) {
    return resolveReminderWebPushPayload({
      stableKey: input.occurrenceId,
      linkedObjectType: input.ruleMeta.linkedObjectType,
      linkedObjectId: input.ruleMeta.linkedObjectId,
      reminderIntent: input.ruleMeta.reminderIntent,
      occurrenceCategory: input.ruleMeta.occurrenceCategory,
      openUrl: input.openUrl,
      customTitle: input.ruleMeta.customTitle,
      customText: input.ruleMeta.customText,
      warmupContext: input.warmupContext,
    });
  }
  const title = stripHtmlLight(input.title ?? "").slice(0, 200);
  const textBody = stripHtmlLight(input.bodyText ?? "").slice(0, 500);
  if (!title && !textBody) return null;
  return {
    title: title || "Напоминание",
    body: textBody || title,
    tag: `reminder:${input.occurrenceId}`,
    pushKind: "custom",
    warmupSloganKey: null,
  };
}

export async function runPlatformUserReminderWebPushNotify(
  input: PlatformUserReminderWebPushNotifyInput,
  deps: PlatformUserReminderWebPushNotifyDeps,
): Promise<PlatformUserReminderWebPushNotifyResult> {
  const gate = await deps.readReminderNotifyGate(input.platformUserId, input.topicCode);
  if (gate.muted) {
    return { ok: true, delivered: 0, skipped: "muted" };
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

  const pushPayload = resolvePushPayload(input);
  if (!pushPayload) {
    await deps.notificationDelivery?.recordNotificationDeliveryAttempt({
      userId: input.platformUserId,
      topicCode: input.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: "web_push",
      status: "skipped",
      reason: "push_copy_skipped",
      occurrenceId: input.occurrenceId,
    });
    return { ok: true, delivered: 0, skipped: "push_copy_skipped" };
  }

  const vapidSubject =
    smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
      `mailto:${smtpParsed.data.from}`
    : "mailto:noreply@invalid";

  const trackedPayload = await createTrackedWebPushPayload({
    userId: input.platformUserId,
    title: pushPayload.title,
    body: pushPayload.body,
    url: input.openUrl,
    tag: pushPayload.tag,
    topicCode: input.topicCode,
    intentType: PATIENT_REMINDER_INTENT_TYPE,
    occurrenceId: input.occurrenceId,
    pushKind: pushPayload.pushKind,
    warmupSloganKey: pushPayload.warmupSloganKey,
  });

  const verbose = await isOperationalVerboseLogEnabled({ systemSettings: deps.systemSettings });
  const r = await sendWebPushToSubscriptions({
    subscriptions: subs,
    vapidPublicKey: vapidKeys.publicKey,
    vapidPrivateKey: vapidKeys.privateKey,
    vapidSubject,
    payload: trackedPayload,
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
            metadata: productAnalyticsMetadataFromPayload(trackedPayload),
          });
        }
      : undefined,
    verbose,
    logContext: {
      userId: input.platformUserId,
      topicCode: input.topicCode,
      occurrenceId: input.occurrenceId,
    },
  });

  if (verbose) {
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
  }

  if (r.delivered > 0) {
    return { ok: true, delivered: r.delivered };
  }
  return { ok: false, error: r.errors > 0 ? "web_push_errors" : "web_push_not_delivered" };
}
