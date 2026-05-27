import { z } from "zod";
import { logger } from "@/infra/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { smtpInnerFromValueJson, sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";
import {
  attachResolutionIdentity,
  logNotificationChannelsResolved,
  type ResolvedNotificationChannels,
  type ResolvedNotificationChannelsCore,
} from "@/modules/patient-notifications/notificationChannelContract";
import {
  resolvePatientNotificationChannels,
  type NotificationTopicGate,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { RecordNotificationDeliveryAttemptInput } from "@/modules/notification-delivery/types";
import type { SkippedNotificationChannel } from "@/modules/patient-notifications/notificationChannelContract";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import {
  createTrackedWebPushPayload,
  productAnalyticsMetadataFromPayload,
} from "@/app-layer/product-analytics/createTrackedWebPushPayload";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";
import type { WarmupPushDynamicContext } from "@/modules/web-push/pushNotificationCopy";
import { resolveReminderWebPushPayload } from "@/modules/web-push/resolveReminderWebPushPayload";

export type ReminderTransactionalEmailCooldownPort = {
  shouldSkipDueToCooldown: (platformUserId: string) => Promise<boolean>;
  recordSent: (platformUserId: string) => Promise<void>;
};

export const integratorPatientReminderNotifyBodySchema = z.object({
  integratorUserId: z.string().regex(/^\d+$/),
  occurrenceId: z.string().min(1).max(240),
  topicCode: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  bodyText: z.string().max(4000).optional().default(""),
  openUrl: z.string().min(1).max(4000),
  linkedObjectType: z.string().max(64).nullable().optional(),
  linkedObjectId: z.string().max(240).nullable().optional(),
  reminderIntent: z.string().max(32).nullable().optional(),
  occurrenceCategory: z.string().max(64).nullable().optional(),
  customTitle: z.string().max(500).nullable().optional(),
});

export type IntegratorPatientReminderNotifyBody = z.infer<typeof integratorPatientReminderNotifyBodySchema>;

export type PatientReminderEmailSkippedReason = "rate_limited";

function stripHtmlLight(s: string): string {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export type PatientReminderIntegratorNotifyDeps = {
  findPlatformUserByIntegratorId: (integratorUserId: string) => Promise<{ platformUserId: string } | null>;
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  getProfileEmailFields: (
    platformUserId: string,
  ) => Promise<{ email: string | null; emailVerifiedAt: string | null }>;
  readReminderNotifyGate: (
    platformUserId: string,
    topicCode: string,
  ) => Promise<{ muted: boolean; topicMasterEnabled: boolean }>;
  getChannelBindings?: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
  reminderTransactionalEmailCooldown?: ReminderTransactionalEmailCooldownPort;
  recordDeliveryAttempt?: (input: RecordNotificationDeliveryAttemptInput) => Promise<void>;
  loadWarmupPushContext?: (platformUserId: string) => Promise<WarmupPushDynamicContext>;
};

const PATIENT_REMINDER_INTENT_TYPE = "patient_reminder";

function mapEmailSendError(error: string): { reason: string; errorMessage: string } {
  if (error === "smtp_not_configured" || error === "smtp_password_missing") {
    return { reason: "provider_disabled", errorMessage: error };
  }
  return { reason: "smtp_error", errorMessage: error.slice(0, 500) };
}

async function recordChannelSkips(
  record: PatientReminderIntegratorNotifyDeps["recordDeliveryAttempt"],
  base: {
    userId?: string;
    integratorUserId: string;
    topicCode: string;
    occurrenceId: string;
  },
  skipped: SkippedNotificationChannel[],
): Promise<void> {
  if (!record) return;
  for (const s of skipped) {
    await record({
      userId: base.userId,
      integratorUserId: base.integratorUserId,
      topicCode: base.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: s.channel,
      status: "skipped",
      reason: s.reason,
      occurrenceId: base.occurrenceId,
    });
  }
}

function resolveChannelsForGateOnly(
  topicCode: string,
  gate: NotificationTopicGate,
): ResolvedNotificationChannelsCore {
  return resolvePatientNotificationChannels({
    topicCode,
    availability: {
      hasTelegram: false,
      hasMax: false,
      hasEmail: false,
      emailVerified: false,
      hasWebPushSubscription: false,
      vapidConfigured: false,
      smtpConfigured: false,
    },
    channelPrefs: [],
    topicChannelRows: [],
    gate,
  });
}

function logResolvedChannels(params: {
  platformUserId?: string;
  integratorUserId: string;
  topicCode: string;
  resolved: Omit<ResolvedNotificationChannels, "userId" | "topicCode" | "integratorUserId">;
  flowSkipped?: string;
}): void {
  logger.info(
    {
      event: "patient_reminder.notify_channels.resolved_channels",
      integratorUserId: params.integratorUserId,
      platformUserId: params.platformUserId,
      topicCode: params.topicCode,
      flowSkipped: params.flowSkipped,
      availableChannels: params.resolved.availableChannels,
      selectedChannels: params.resolved.selectedChannels,
      skippedChannels: params.resolved.skippedChannels,
    },
    "patient reminder notify-channels resolved channels",
  );

  if (params.platformUserId) {
    logNotificationChannelsResolved({
      resolution: attachResolutionIdentity(params.resolved, {
        userId: params.platformUserId,
        topicCode: params.topicCode,
        integratorUserId: params.integratorUserId,
      }),
      deliveryPath: "webapp_m2m",
      intentType: "patient_reminder",
    });
  }
}

function logNotifyResult(params: {
  integratorUserId: string;
  platformUserId?: string;
  topicCode: string;
  occurrenceId: string;
  outcome: Record<string, unknown>;
}): void {
  logger.info(
    {
      event: "patient_reminder.notify_channels.result",
      integratorUserId: params.integratorUserId,
      platformUserId: params.platformUserId,
      topicCode: params.topicCode,
      occurrenceId: params.occurrenceId,
      ok: params.outcome.ok,
      skipped: params.outcome.skipped,
      selectedChannels: params.outcome.selectedChannels,
      skippedChannels: params.outcome.skippedChannels,
      webPushDelivered: params.outcome.webPushDelivered,
      webPushErrors: params.outcome.webPushErrors,
      webPushDeactivated: params.outcome.webPushDeactivated,
      emailOk: params.outcome.emailOk,
      emailError: params.outcome.emailError,
      emailSkipped: params.outcome.emailSkipped,
    },
    "patient reminder notify-channels result",
  );
}

function withEmailRateLimitSkip(
  skippedChannels: ResolvedNotificationChannels["skippedChannels"],
  emailSkipped?: PatientReminderEmailSkippedReason,
): ResolvedNotificationChannels["skippedChannels"] {
  if (emailSkipped !== "rate_limited") return skippedChannels;
  if (skippedChannels.some((s) => s.channel === "email" && s.reason === "rate_limited")) {
    return skippedChannels;
  }
  return [...skippedChannels, { channel: "email", reason: "rate_limited" }];
}

export async function runPatientReminderIntegratorNotify(
  body: IntegratorPatientReminderNotifyBody,
  deps: PatientReminderIntegratorNotifyDeps,
): Promise<Record<string, unknown>> {
  logger.info(
    {
      event: "patient_reminder.notify_channels.received",
      integratorUserId: body.integratorUserId,
      topicCode: body.topicCode,
      occurrenceId: body.occurrenceId,
      idempotencyKey: `prn:${body.occurrenceId}:channels`,
    },
    "patient reminder notify-channels received",
  );

  const resultCtx = {
    integratorUserId: body.integratorUserId,
    topicCode: body.topicCode,
    occurrenceId: body.occurrenceId,
  };

  const platform = await deps.findPlatformUserByIntegratorId(body.integratorUserId);
  if (!platform) {
    const emptyResolved = {
      selectedChannels: [],
      skippedChannels: [],
      availableChannels: [],
      enabledChannels: [],
    };
    logResolvedChannels({
      integratorUserId: body.integratorUserId,
      topicCode: body.topicCode,
      resolved: emptyResolved,
      flowSkipped: "no_platform_user",
    });
    const out = { ok: true, skipped: "no_platform_user", skippedChannels: [] as const };
    logNotifyResult({ ...resultCtx, outcome: out });
    return out;
  }
  const uid = platform.platformUserId;

  logger.info(
    {
      event: "patient_reminder.notify_channels.resolved_user",
      integratorUserId: body.integratorUserId,
      platformUserId: uid,
    },
    "patient reminder notify-channels resolved user",
  );

  const gate = await deps.readReminderNotifyGate(uid, body.topicCode);
  if (gate.muted || !gate.topicMasterEnabled) {
    const gateResolved = resolveChannelsForGateOnly(body.topicCode, gate);
    const flowSkipped = gate.muted ? "muted" : "topic_disabled";
    logResolvedChannels({
      integratorUserId: body.integratorUserId,
      platformUserId: uid,
      topicCode: body.topicCode,
      resolved: gateResolved,
      flowSkipped,
    });
    await recordChannelSkips(deps.recordDeliveryAttempt, {
      userId: uid,
      integratorUserId: body.integratorUserId,
      topicCode: body.topicCode,
      occurrenceId: body.occurrenceId,
    }, gateResolved.skippedChannels);
    const out = {
      ok: true,
      skipped: flowSkipped,
      selectedChannels: gateResolved.selectedChannels,
      skippedChannels: gateResolved.skippedChannels,
    };
    logNotifyResult({ ...resultCtx, platformUserId: uid, outcome: out });
    return out;
  }

  const prefs = await deps.channelPreferences.getPreferences(uid);
  const topicRows = await deps.topicChannelPrefs.listByUserId(uid);
  const emailFields = await deps.getProfileEmailFields(uid);
  const bindings = (await deps.getChannelBindings?.(uid)) ?? {};
  const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const subs = await deps.webPushSubscriptions.listActiveByUserId(uid);

  const resolved = resolvePatientNotificationChannels({
    topicCode: body.topicCode,
    availability: {
      hasTelegram: Boolean(bindings.telegramId?.trim()),
      hasMax: Boolean(bindings.maxId?.trim()),
      hasEmail: Boolean(emailFields.email?.trim()),
      emailVerified: Boolean(emailFields.emailVerifiedAt),
      hasWebPushSubscription: subs.length > 0,
      vapidConfigured: Boolean(vapidKeys),
      smtpConfigured: smtpParsed?.success === true,
    },
    channelPrefs: prefs,
    topicChannelRows: topicRows,
    gate,
  });

  logResolvedChannels({
    integratorUserId: body.integratorUserId,
    platformUserId: uid,
    topicCode: body.topicCode,
    resolved,
  });

  const out: Record<string, unknown> = {
    ok: true,
    selectedChannels: resolved.selectedChannels,
    skippedChannels: resolved.skippedChannels,
  };

  if (
    resolved.selectedChannels.includes("web_push") &&
    !vapidKeys &&
    deps.recordDeliveryAttempt
  ) {
    await deps.recordDeliveryAttempt({
      userId: uid,
      integratorUserId: body.integratorUserId,
      topicCode: body.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      channel: "web_push",
      status: "skipped",
      reason: "vapid_missing",
      occurrenceId: body.occurrenceId,
    });
  }

  if (resolved.selectedChannels.includes("web_push") && vapidKeys) {
    const warmupContext =
      deps.loadWarmupPushContext ? await deps.loadWarmupPushContext(uid).catch(() => ({})) : undefined;
    const pushPayload = resolveReminderWebPushPayload({
      stableKey: body.occurrenceId,
      linkedObjectType: body.linkedObjectType,
      linkedObjectId: body.linkedObjectId,
      reminderIntent: body.reminderIntent,
      occurrenceCategory: body.occurrenceCategory,
      openUrl: body.openUrl,
      customTitle: body.customTitle,
      customText: body.bodyText ?? "",
      warmupContext,
    });
    const vapidSubject =
      smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
        `mailto:${smtpParsed.data.from}`
      : "mailto:noreply@invalid";

    if (!pushPayload) {
      await deps.recordDeliveryAttempt?.({
        userId: uid,
        integratorUserId: body.integratorUserId,
        topicCode: body.topicCode,
        intentType: PATIENT_REMINDER_INTENT_TYPE,
        channel: "web_push",
        status: "skipped",
        reason: "push_copy_skipped",
        occurrenceId: body.occurrenceId,
      });
    } else {
    const trackedPayload = await createTrackedWebPushPayload({
      userId: uid,
      title: pushPayload.title,
      body: pushPayload.body,
      url: body.openUrl,
      tag: pushPayload.tag,
      topicCode: body.topicCode,
      intentType: PATIENT_REMINDER_INTENT_TYPE,
      occurrenceId: body.occurrenceId,
      pushKind: pushPayload.pushKind,
      warmupSloganKey: pushPayload.warmupSloganKey,
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
              intentType: PATIENT_REMINDER_INTENT_TYPE,
              channel: "web_push",
              status: attempt.status,
              reason: attempt.reason,
              providerStatusCode: attempt.providerStatusCode,
              endpointHash: attempt.endpointHash,
              occurrenceId: body.occurrenceId,
              errorMessage: attempt.errorMessage,
              metadata: productAnalyticsMetadataFromPayload(trackedPayload),
            });
          }
        : undefined,
      logContext: {
        userId: uid,
        topicCode: body.topicCode,
        occurrenceId: body.occurrenceId,
      },
    });
    out.webPushDelivered = r.delivered;
    out.webPushErrors = r.errors;
    out.webPushDeactivated = r.deactivated;

    logger.info(
      {
        event: "web_push_send_result",
        userId: uid,
        topicCode: body.topicCode,
        occurrenceId: body.occurrenceId,
        delivered: r.delivered,
        errors: r.errors,
        activeSubscriptionsCount: subs.length,
        deactivatedSubscriptionsCount: r.deactivated,
      },
      "web push send result",
    );

    logger.info(
      {
        event: "patient_reminder.notify_channels.web_push.result",
        platformUserId: uid,
        topicCode: body.topicCode,
        activeSubscriptionsCount: subs.length,
        webPushDelivered: r.delivered,
        webPushErrors: r.errors,
        deactivatedSubscriptionsCount: r.deactivated,
      },
      "patient reminder web push result",
    );
    }
  }

  let emailSkipped: PatientReminderEmailSkippedReason | undefined;
  if (resolved.selectedChannels.includes("email") && emailFields.email?.trim() && emailFields.emailVerifiedAt) {
    const cooldownPort = deps.reminderTransactionalEmailCooldown;
    if (cooldownPort && (await cooldownPort.shouldSkipDueToCooldown(uid))) {
      emailSkipped = "rate_limited";
      out.emailSkipped = emailSkipped;
      await deps.recordDeliveryAttempt?.({
        userId: uid,
        integratorUserId: body.integratorUserId,
        topicCode: body.topicCode,
        intentType: PATIENT_REMINDER_INTENT_TYPE,
        channel: "email",
        status: "skipped",
        reason: "rate_limited",
        occurrenceId: body.occurrenceId,
        recipientRef: emailFields.email.trim(),
      });
    } else {
      const listUnsubscribe =
        smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
          `<mailto:${smtpParsed.data.from.trim()}?subject=unsubscribe>`
        : null;
      const subject = stripHtmlLight(body.title).slice(0, 200) || "Напоминание";
      const text =
        `${stripHtmlLight(body.bodyText ?? "")}\n\n${body.openUrl}`.trim().slice(0, 8000);
      const res = await sendTransactionalSmtpEmail({
        smtpValueJson: smtp?.valueJson,
        to: emailFields.email.trim(),
        subject,
        text: text || body.openUrl,
        listUnsubscribe,
      });
      out.emailOk = res.ok;
      if (!res.ok) {
        out.emailError = res.error;
        const mapped = mapEmailSendError(res.error);
        await deps.recordDeliveryAttempt?.({
          userId: uid,
          integratorUserId: body.integratorUserId,
          topicCode: body.topicCode,
          intentType: PATIENT_REMINDER_INTENT_TYPE,
          channel: "email",
          status: "failed",
          reason: mapped.reason,
          occurrenceId: body.occurrenceId,
          recipientRef: emailFields.email.trim(),
          errorMessage: mapped.errorMessage,
        });
      } else {
        await deps.recordDeliveryAttempt?.({
          userId: uid,
          integratorUserId: body.integratorUserId,
          topicCode: body.topicCode,
          intentType: PATIENT_REMINDER_INTENT_TYPE,
          channel: "email",
          status: "success",
          occurrenceId: body.occurrenceId,
          recipientRef: emailFields.email.trim(),
        });
        if (cooldownPort) await cooldownPort.recordSent(uid);
      }
    }
  }

  out.skippedChannels = withEmailRateLimitSkip(
    resolved.skippedChannels,
    emailSkipped,
  );

  await recordChannelSkips(
    deps.recordDeliveryAttempt,
    {
      userId: uid,
      integratorUserId: body.integratorUserId,
      topicCode: body.topicCode,
      occurrenceId: body.occurrenceId,
    },
    (out.skippedChannels as SkippedNotificationChannel[]) ?? resolved.skippedChannels,
  );

  logNotifyResult({ ...resultCtx, platformUserId: uid, outcome: out });
  return out;
}
