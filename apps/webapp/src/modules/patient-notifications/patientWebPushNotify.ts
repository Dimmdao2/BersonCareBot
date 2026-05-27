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
import { smtpInnerFromValueJson } from "@/modules/outbound-email/sendTransactionalSmtp";
import type { RecordNotificationDeliveryAttemptInput } from "@/modules/notification-delivery/types";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import { REMINDER_NOTIFICATION_TOPIC_APPOINTMENT } from "@/modules/reminders/notificationTopicCode";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import {
  buildAppointmentLifecyclePushCopy,
  buildAppointmentReminderPushCopy,
  buildNewsPushCopy,
  type AppointmentLifecycleVariant,
} from "@/modules/web-push/pushNotificationCopy";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import {
  createTrackedWebPushPayload,
  productAnalyticsMetadataFromPayload,
} from "@/app-layer/product-analytics/createTrackedWebPushPayload";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";
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
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<NotificationTopicGate>;
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

const INTENT_TYPE = "patient_web_push";

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
  if (gate.muted || !gate.topicMasterEnabled) {
    return { ok: true, skipped: gate.muted ? "muted" : "topic_disabled" };
  }

  const prefs = await deps.channelPreferences.getPreferences(uid);
  const topicRows = await deps.topicChannelPrefs.listByUserId(uid);
  const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const subs = await deps.webPushSubscriptions.listActiveByUserId(uid);

  const resolved = resolvePatientNotificationChannels({
    topicCode: body.topicCode,
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
    return { ok: true, skipped: "web_push_not_selected", skippedChannels: resolved.skippedChannels };
  }
  if (!vapidKeys) {
    return { ok: true, skipped: "vapid_missing" };
  }
  if (subs.length === 0) {
    return { ok: true, skipped: "no_active_subscriptions" };
  }

  const copy = buildCopy(body, timeZone);
  if (!copy || (!copy.title.trim() && !copy.body.trim())) {
    return { ok: true, skipped: "push_copy_empty" };
  }

  const pushOpenUrl =
    body.intentType === "appointment_lifecycle" ? buildPatientMessagesOpenUrl() : body.openUrl;

  const vapidSubject =
    smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
      `mailto:${smtpParsed.data.from}`
    : "mailto:noreply@invalid";

  const pushKind =
    body.intentType === "news" ? "news"
    : body.intentType === "appointment_reminder" ? "custom"
    : "custom";

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

  const r = await sendWebPushToSubscriptions({
    subscriptions: subs,
    vapidPublicKey: vapidKeys.publicKey,
    vapidPrivateKey: vapidKeys.privateKey,
    vapidSubject,
    payload: trackedPayload,
    onSubscriptionDead: async (endpoint) => {
      await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
    },
    onAttempt: deps.recordDeliveryAttempt
      ? async (attempt) => {
          await deps.recordDeliveryAttempt!({
            userId: uid,
            integratorUserId: body.integratorUserId,
            topicCode: body.topicCode,
            intentType: INTENT_TYPE,
            channel: "web_push",
            status: attempt.status,
            reason: attempt.reason,
            providerStatusCode: attempt.providerStatusCode,
            endpointHash: attempt.endpointHash,
            errorMessage: attempt.errorMessage,
            metadata: productAnalyticsMetadataFromPayload(trackedPayload),
          });
        }
      : undefined,
    logContext: {
      userId: uid,
      topicCode: body.topicCode,
    },
  });

  logger.info(
    {
      event: "patient_web_push_notify.result",
      platformUserId: uid,
      topicCode: body.topicCode,
      intentType: body.intentType,
      delivered: r.delivered,
      errors: r.errors,
    },
    "patient web push notify result",
  );

  return {
    ok: true,
    webPushDelivered: r.delivered,
    webPushErrors: r.errors,
    webPushDeactivated: r.deactivated,
  };
}
