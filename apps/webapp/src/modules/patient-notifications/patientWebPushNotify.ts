/**
 * P15 — PLAN S14b migration.
 *
 * Instead of calling `sendWebPushToSubscriptions` directly (G2-guarded webapp sink),
 * this function now emits a `web_push` intent to the integrator via relay-outbound.
 * The integrator's `WebPushDeliveryAdapter` resolves subscriptions + VAPID and
 * performs the actual send, covered by the pre-fork redirect chokepoint (G1).
 *
 * G2 guard retired (S16) — 0 live callers, secondary layer. Was:
 * the other un-migrated legs (S14c–S14g).
 *
 * `systemSettings` is kept in `PatientWebPushNotifyDeps` for call-site backward
 * compat (buildAppDeps, route.ts, fanOutBroadcastWebPush). It is no longer used
 * inside this function — VAPID + SMTP are read by the integrator adapter.
 *
 * `recordDeliveryAttempt` is kept in deps for call-site compat. Delivery-attempt
 * logging for this leg has moved to the integrator adapter (PLAN S14 step 1).
 */
import { z } from "zod";
import { routePaths } from "@/app-layer/routes/paths";
import { logger } from "@/infra/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import type { PatientInboundChatPort } from "@/modules/messaging/ports";
import {
  appendPatientInboundAdminMessage,
  bookingLifecycleChatIntegratorMessageId,
} from "@/modules/messaging/appendPatientInboundAdminMessage";
import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import type { RecordNotificationDeliveryAttemptInput } from "@/modules/notification-delivery/types";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import { REMINDER_NOTIFICATION_TOPIC_APPOINTMENT } from "@/modules/reminders/notificationTopicCode";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import {
  buildAppointmentLifecyclePushCopy,
  buildAppointmentReminderPushCopy,
  buildNewsPushCopy,
  type AppointmentLifecycleVariant,
} from "@/modules/web-push/pushNotificationCopy";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { createTrackedWebPushPayload } from "@/app-layer/product-analytics/createTrackedWebPushPayload";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";

export const integratorPatientWebPushNotifyBodySchema = z
  .object({
    integratorUserId: z.string().regex(/^\d+$/).optional(),
    phoneNormalized: z.string().min(8).max(32).optional(),
    platformUserId: z.string().uuid().optional(),
    topicCode: z.string().min(1).max(120).default(REMINDER_NOTIFICATION_TOPIC_APPOINTMENT),
    intentType: z.enum(["appointment_lifecycle", "appointment_reminder", "news"]),
    variant: z.enum(["created", "cancelled", "rescheduled"]).optional(),
    slotStartIso: z.string().min(1).max(64).optional(),
    openUrl: z.string().min(1).max(4000),
    stableKey: z.string().min(1).max(240),
    broadcastTitle: z.string().max(500).optional(),
    nowIso: z.string().max(64).optional(),
  })
  .refine((body) => Boolean(body.platformUserId || body.integratorUserId || body.phoneNormalized), {
    message: "missing_user_ref",
  });

export type IntegratorPatientWebPushNotifyBody = z.infer<typeof integratorPatientWebPushNotifyBodySchema>;

export type PatientWebPushNotifyDeps = {
  findPlatformUserByIntegratorId: (integratorUserId: string) => Promise<{ platformUserId: string } | null>;
  findPlatformUserByPhone: (phoneNormalized: string) => Promise<{ platformUserId: string } | null>;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  /**
   * Kept for call-site backward compat (buildAppDeps, route.ts, fanOutBroadcastWebPush).
   * No longer used by this function — VAPID + SMTP are read by the integrator adapter (PLAN S14b).
   */
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
  /**
   * Kept for call-site backward compat. Delivery-attempt logging for this leg has moved
   * to the integrator adapter (PLAN S14 step 1). No longer called here.
   */
  recordDeliveryAttempt?: (input: RecordNotificationDeliveryAttemptInput) => Promise<void>;
  patientInboundChatPort?: PatientInboundChatPort;
};

function buildPatientMessagesOpenUrl(): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  return `${base}${routePaths.patientMessages}`;
}

function bookingIdFromLifecycleStableKey(stableKey: string): string | null {
  const m = stableKey.match(/^booking-(?:created|cancelled|rescheduled):(.+)$/);
  return m?.[1] ?? null;
}

function lifecycleChatText(copy: { title: string; body: string }): string {
  const t = copy.title.trim();
  const b = copy.body.trim();
  if (t && b) return `${t}\n\n${b}`;
  return t || b;
}

function buildCopy(
  body: IntegratorPatientWebPushNotifyBody,
  timeZone: string,
): { title: string; body: string } | null {
  if (body.intentType === "news") {
    return buildNewsPushCopy(body.broadcastTitle ?? "");
  }
  if (body.intentType === "appointment_reminder") {
    if (!body.slotStartIso) return null;
    return buildAppointmentReminderPushCopy(
      body.slotStartIso,
      body.nowIso ?? new Date().toISOString(),
      timeZone,
    );
  }
  if (!body.variant || !body.slotStartIso) return null;
  return buildAppointmentLifecyclePushCopy(body.variant as AppointmentLifecycleVariant, body.slotStartIso, timeZone);
}

export async function runPatientWebPushNotify(
  body: IntegratorPatientWebPushNotifyBody,
  deps: PatientWebPushNotifyDeps,
): Promise<Record<string, unknown>> {
  const platform =
    body.platformUserId ?
      { platformUserId: body.platformUserId }
    : body.integratorUserId ?
      await deps.findPlatformUserByIntegratorId(body.integratorUserId)
    : body.phoneNormalized ?
      await deps.findPlatformUserByPhone(body.phoneNormalized)
    : null;

  if (!platform) {
    return { ok: true, skipped: "no_platform_user" };
  }

  const uid = platform.platformUserId;
  const timeZone = await getAppDisplayTimeZone();

  if (
    body.intentType === "appointment_lifecycle" &&
    body.variant &&
    body.slotStartIso &&
    deps.patientInboundChatPort
  ) {
    const lifecycleCopy = buildAppointmentLifecyclePushCopy(
      body.variant as AppointmentLifecycleVariant,
      body.slotStartIso,
      timeZone,
    );
    const bookingId = bookingIdFromLifecycleStableKey(body.stableKey);
    const chatText = lifecycleChatText(lifecycleCopy);
    if (bookingId && chatText) {
      try {
        await appendPatientInboundAdminMessage(deps.patientInboundChatPort, {
          platformUserId: uid,
          text: chatText,
          integratorMessageId: bookingLifecycleChatIntegratorMessageId(body.variant, bookingId),
        });
      } catch (err) {
        logger.warn(
          { err, event: "patient_web_push.booking_chat_append_failed", platformUserId: uid, stableKey: body.stableKey },
          "booking lifecycle chat append failed",
        );
      }
    }
  }

  const gate = await deps.readReminderNotifyGate(uid, body.topicCode);
  if (gate.muted) {
    return { ok: true, skipped: "muted" };
  }

  const [prefs, topicRows, hasSubs] = await Promise.all([
    deps.channelPreferences.getPreferences(uid),
    deps.topicChannelPrefs.listByUserId(uid),
    // Pre-check: avoid relay call for users with no subscriptions at all.
    // Integrator adapter also checks at send time, but we short-circuit here
    // to preserve the same skipped-channel semantics as the old path.
    deps.webPushSubscriptions.hasAnyForUserId(uid),
  ]);

  const resolved = resolvePatientNotificationChannels({
    topicCode: body.topicCode,
    availability: {
      hasTelegram: false,
      hasMax: false,
      hasEmail: false,
      emailVerified: false,
      hasWebPushSubscription: hasSubs,
      // VAPID is now read by the integrator adapter; treat as always configured here.
      vapidConfigured: true,
    },
    channelPrefs: prefs,
    topicChannelRows: topicRows,
    gate,
  });

  if (!resolved.selectedChannels.includes("web_push")) {
    return { ok: true, skipped: "web_push_not_selected", skippedChannels: resolved.skippedChannels };
  }
  if (!hasSubs) {
    return { ok: true, skipped: "no_active_subscriptions" };
  }

  const copy = buildCopy(body, timeZone);
  if (!copy || (!copy.title.trim() && !copy.body.trim())) {
    return { ok: true, skipped: "push_copy_empty" };
  }

  const pushOpenUrl =
    body.intentType === "appointment_lifecycle" ? buildPatientMessagesOpenUrl() : body.openUrl;

  const pushKind =
    body.intentType === "news" ? "news"
    : body.intentType === "appointment_reminder" ? "custom"
    : "custom";

  // Register product analytics + obtain trackingId for delivery attribution.
  // The integrator adapter carries the full payload and will attach trackingId
  // to the actual notification via pushExtras.
  const trackedPayload = await createTrackedWebPushPayload({
    userId: uid,
    title: copy.title,
    body: copy.body,
    url: pushOpenUrl,
    tag: body.stableKey.slice(0, 240),
    topicCode: body.topicCode,
    intentType: body.intentType,
    pushKind,
    warmupSloganKey: null,
  });

  // Emit a web_push intent to the integrator via relay-outbound.
  // The integrator's WebPushDeliveryAdapter (S14) resolves subscriptions + VAPID
  // and performs the actual send. In dev (DEV_DELIVERY_REDIRECT=1), the pre-fork
  // redirect collapses to the telegram test chat — ZERO real webpush.sendNotification calls.
  const tag = body.stableKey.slice(0, 240);
  const result = await relayOutbound({
    messageId: `patient-web-push:${uid}:${tag}`,
    channel: "web_push",
    recipient: uid,
    text: trackedPayload.body,
    metadata: {
      title: trackedPayload.title,
      url: trackedPayload.url,
      pushExtras: {
        tag,
        trackingId: trackedPayload.trackingId ?? undefined,
        topicCode: body.topicCode,
        intentType: body.intentType,
        pushKind,
        warmupSloganKey: null,
      },
    },
  }).catch((err: unknown) => {
    logger.warn(
      { err, event: "patient_web_push_notify.relay_failed", platformUserId: uid, topicCode: body.topicCode },
      "patient web push notify relay failed",
    );
    return { ok: false as const, reason: "relay_error" };
  });

  if (!result.ok) {
    return { ok: true, webPushDelivered: 0, webPushErrors: 1, webPushDeactivated: 0 };
  }

  return {
    ok: true,
    webPushDelivered: 1,
    webPushErrors: 0,
    webPushDeactivated: 0,
  };
}
