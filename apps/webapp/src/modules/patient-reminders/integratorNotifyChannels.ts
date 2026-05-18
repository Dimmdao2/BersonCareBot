import { z } from "zod";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { smtpInnerFromValueJson, sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";
import { allowedChannelsForTopic } from "@/modules/patient-notifications/topicChannelRules";
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

function resolveTopicChannelEnabled(
  rows: Awaited<ReturnType<TopicChannelPrefsPort["listByUserId"]>>,
  topicCode: string,
  channelCode: "web_push" | "email",
): boolean {
  const row = rows.find((r) => r.topicCode === topicCode && r.channelCode === channelCode);
  return row ? row.isEnabled : true;
}

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
  reminderTransactionalEmailCooldown?: ReminderTransactionalEmailCooldownPort;
};

export async function runPatientReminderIntegratorNotify(
  body: IntegratorPatientReminderNotifyBody,
  deps: PatientReminderIntegratorNotifyDeps,
): Promise<Record<string, unknown>> {
  const platform = await deps.findPlatformUserByIntegratorId(body.integratorUserId);
  if (!platform) {
    return { ok: true, skipped: "no_platform_user" };
  }
  const uid = platform.platformUserId;

  const gate = await deps.readReminderNotifyGate(uid, body.topicCode);
  if (gate.muted) {
    return { ok: true, skipped: "muted" };
  }
  if (!gate.topicMasterEnabled) {
    return { ok: true, skipped: "topic_disabled" };
  }

  const allowed = new Set(allowedChannelsForTopic(body.topicCode));
  const prefs = await deps.channelPreferences.getPreferences(uid);
  const byCode = new Map(prefs.map((p) => [p.channelCode, p]));
  const topicRows = await deps.topicChannelPrefs.listByUserId(uid);

  const out: Record<string, unknown> = { ok: true };

  const wantPush =
    allowed.has("web_push") &&
    byCode.get("web_push")?.isEnabledForNotifications !== false &&
    resolveTopicChannelEnabled(topicRows, body.topicCode, "web_push");

  if (wantPush) {
    const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
    if (vapidKeys) {
      const subs = await deps.webPushSubscriptions.listActiveByUserId(uid);
      if (subs.length > 0) {
        const smtpRow = await deps.systemSettings.getSetting("smtp_outbound", "admin");
        const fromParsed = smtpRow?.valueJson ? smtpInnerFromValueJson(smtpRow.valueJson) : null;
        const vapidSubject =
          fromParsed?.success === true && fromParsed.data.from.includes("@") ?
            `mailto:${fromParsed.data.from}`
          : "mailto:noreply@invalid";

        const title = stripHtmlLight(body.title).slice(0, 200);
        const textBody = stripHtmlLight(body.bodyText ?? "").slice(0, 500);

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
        });
        out.webPushDelivered = r.delivered;
        out.webPushErrors = r.errors;
      }
    }
  }

  const wantEmail =
    allowed.has("email") &&
    byCode.get("email")?.isEnabledForNotifications !== false &&
    resolveTopicChannelEnabled(topicRows, body.topicCode, "email");

  if (wantEmail) {
    const emailFields = await deps.getProfileEmailFields(uid);
    if (emailFields.email?.trim() && emailFields.emailVerifiedAt) {
      const cooldownPort = deps.reminderTransactionalEmailCooldown;
      if (cooldownPort && (await cooldownPort.shouldSkipDueToCooldown(uid))) {
        out.emailSkipped = "rate_limited";
      } else {
        const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
        const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
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
  }

  return out;
}
