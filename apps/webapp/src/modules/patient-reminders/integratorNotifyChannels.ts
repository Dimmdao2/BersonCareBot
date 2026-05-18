import { z } from "zod";
import { logger } from "@/infra/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { smtpInnerFromValueJson, sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";
import { hashWebPushEndpoint } from "@/modules/patient-notifications/hashWebPushEndpoint";
import { resolvePatientNotificationChannels } from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";

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
});

export type IntegratorPatientReminderNotifyBody = z.infer<typeof integratorPatientReminderNotifyBodySchema>;

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
};

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

  const platform = await deps.findPlatformUserByIntegratorId(body.integratorUserId);
  if (!platform) {
    logger.info(
      {
        event: "patient_reminder.notify_channels.resolved_user",
        integratorUserId: body.integratorUserId,
        skipped: "no_platform_user",
      },
      "patient reminder notify-channels no platform user",
    );
    return { ok: true, skipped: "no_platform_user" };
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
  if (gate.muted) {
    return { ok: true, skipped: "muted" };
  }
  if (!gate.topicMasterEnabled) {
    return { ok: true, skipped: "topic_disabled" };
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

  logger.info(
    {
      event: "patient_reminder.notify_channels.resolved_channels",
      platformUserId: uid,
      topicCode: body.topicCode,
      allowedChannels: resolved.availableChannels,
      selectedChannels: resolved.selectedChannels,
      skippedChannels: resolved.skippedChannels,
    },
    "patient reminder notify-channels resolved channels",
  );

  logger.info(
    {
      event: "notification_channels_resolved",
      userId: uid,
      topicCode: body.topicCode,
      selectedChannels: resolved.selectedChannels,
      skippedChannels: resolved.skippedChannels,
      availableChannels: resolved.availableChannels,
      enabledChannels: resolved.enabledChannels,
    },
    "notification channels resolved",
  );

  const out: Record<string, unknown> = {
    ok: true,
    selectedChannels: resolved.selectedChannels,
    skippedChannels: resolved.skippedChannels,
  };

  if (resolved.selectedChannels.includes("web_push") && vapidKeys) {
    const title = stripHtmlLight(body.title).slice(0, 200);
    const textBody = stripHtmlLight(body.bodyText ?? "").slice(0, 500);
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
        url: body.openUrl,
        tag: `reminder:${body.occurrenceId}`,
      },
      onSubscriptionDead: async (endpoint) => {
        await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
      },
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

  if (resolved.selectedChannels.includes("email") && emailFields.email?.trim() && emailFields.emailVerifiedAt) {
    const cooldownPort = deps.reminderTransactionalEmailCooldown;
    if (cooldownPort && (await cooldownPort.shouldSkipDueToCooldown(uid))) {
      out.emailSkipped = "rate_limited";
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
      if (!res.ok) out.emailError = res.error;
      else if (cooldownPort) await cooldownPort.recordSent(uid);
    }
  }

  return out;
}
