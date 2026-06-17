/**
 * P20 MIGRATION (PLAN S14b — web-push-only/tick cron, platform-user reminder).
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * this function now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` handles the actual send + VAPID resolution,
 * covered by the pre-fork redirect chokepoint (G1).
 *
 * G2 guard retired (S16) — 0 live callers. Was:
 * other un-migrated legs (S14c–S14g). Do NOT touch that guard here.
 *
 * Channel-preference + subscription existence + VAPID availability pre-checks are still
 * performed in the webapp to avoid unnecessary relay calls. The integrator re-reads
 * subscriptions and VAPID at send time; the webapp pre-checks are best-effort guards.
 *
 * `smtpConfigured` / SMTP fetch removed: this function only selects web_push
 * (hasEmail: false), so SMTP availability does not affect channel selection here.
 * VAPID is now read by the integrator adapter — we keep the webapp pre-check only
 * to short-circuit before emitting a relay that would fail at the adapter anyway.
 *
 * `createTrackedWebPushPayload` is kept: it registers product-analytics push records
 * (not a send path). All payload fields (including `trackingId`) are forwarded via
 * `metadata.pushExtras` so the integrator adapter includes them in the push body.
 */
import { logger } from "@/infra/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { NotificationDeliveryService } from "@/modules/notification-delivery/service";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WarmupPushDynamicContext } from "@/modules/web-push/pushNotificationCopy";
import { createTrackedWebPushPayload } from "@/app-layer/product-analytics/createTrackedWebPushPayload";
import {
  resolveReminderWebPushPayload,
  type ReminderWebPushPayload,
} from "@/modules/web-push/resolveReminderWebPushPayload";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { relayOutbound } from "@/modules/messaging/relayOutbound";

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
      // smtpConfigured omitted: email channel disabled (hasEmail: false) — not consulted
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

  // Register product-analytics tracking record and build the push payload with trackingId.
  // This is NOT a send path — createTrackedWebPushPayload only records analytics.
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

  // Emit a web_push intent to the integrator via relay-outbound.
  // The integrator's WebPushDeliveryAdapter (S14) performs the actual send.
  // In dev (DEV_DELIVERY_REDIRECT=1), the pre-fork redirect collapses to the
  // telegram test chat — ZERO real webpush.sendNotification calls.
  // All WebPushClientPayload fields are forwarded via metadata so the integrator
  // adapter can reconstruct them faithfully (title, url, tag, trackingId, etc.).
  const messageId = `reminder-push:${input.platformUserId}:${input.occurrenceId}`;
  const result = await relayOutbound({
    messageId,
    channel: "web_push",
    recipient: input.platformUserId,
    text: trackedPayload.body,
    metadata: {
      title: trackedPayload.title,
      url: trackedPayload.url,
      pushExtras: {
        tag: trackedPayload.tag,
        ...(trackedPayload.trackingId ? { trackingId: trackedPayload.trackingId } : {}),
        ...(trackedPayload.topicCode != null ? { topicCode: trackedPayload.topicCode } : {}),
        ...(trackedPayload.intentType != null ? { intentType: trackedPayload.intentType } : {}),
        ...(trackedPayload.pushKind != null ? { pushKind: trackedPayload.pushKind } : {}),
        ...(trackedPayload.warmupSloganKey != null ? { warmupSloganKey: trackedPayload.warmupSloganKey } : {}),
      },
    },
  }).catch((err: unknown) => {
    logger.warn(
      {
        err,
        platformUserId: input.platformUserId,
        occurrenceId: input.occurrenceId,
        topicCode: input.topicCode,
      },
      "platform user reminder web push relay failed",
    );
    return { ok: false as const, reason: "relay_error" };
  });

  if (!result.ok) {
    await deps.notificationDelivery?.recordNotificationDeliveryAttempt({
      userId: input.platformUserId,
      topicCode: input.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: "web_push",
      status: "failed",
      reason: "relay_failed",
      occurrenceId: input.occurrenceId,
    });
    return { ok: false, error: "web_push_relay_failed" };
  }

  await deps.notificationDelivery?.recordNotificationDeliveryAttempt({
    userId: input.platformUserId,
    topicCode: input.topicCode,
    intentType: PATIENT_REMINDER_INTENT_TYPE,
    channel: "web_push",
    status: "success",
    reason: undefined,
    occurrenceId: input.occurrenceId,
  });

  logger.info(
    {
      event: "web_push_only_reminder.relay_dispatched",
      platformUserId: input.platformUserId,
      occurrenceId: input.occurrenceId,
      topicCode: input.topicCode,
      relayStatus: result.status,
    },
    "web push-only reminder relayed to integrator",
  );

  return { ok: true, delivered: 1 };
}
