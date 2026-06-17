import { routePaths } from "@/app-layer/routes/paths";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { logger } from "@/infra/logging/logger";
import { smtpInnerFromValueJson } from "@/modules/system-settings/smtpOutboundPatch";
import { NOTIFICATION_TOPIC_SPECIALIST_MESSAGES } from "@/modules/patient-notifications/notificationTopicCodes";
import {
  resolvePatientNotificationChannels,
  type PatientNotificationChannelAvailability,
} from "@/modules/patient-notifications/resolveNotificationChannels";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { buildMessagePushCopy } from "@/modules/web-push/pushNotificationCopy";
import { sendWebPushToSubscriptions } from "@/modules/web-push/sendWebPushToSubscriptions";
import { isOperationalVerboseLogEnabled } from "@/modules/observability/operationalVerboseLog";
import { relayOutbound, type RelayOutboundDeps } from "./relayOutbound";

const EMAIL_SUBJECT = "Новое сообщение в чате";

export type NotifyPatientDoctorReplyParams = {
  platformUserId: string;
  messageId: string;
  text: string;
  /** Defaults to {@link NOTIFICATION_TOPIC_SPECIALIST_MESSAGES}. */
  topicCode?: string;
};

export type NotifyPatientDoctorReplyDeps = RelayOutboundDeps & {
  channelPreferences: ChannelPreferencesPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  readReminderNotifyGate: (platformUserId: string, topicCode: string) => Promise<{ muted: boolean }>;
  getProfileEmailFields: (
    platformUserId: string,
  ) => Promise<{ email: string | null; emailVerifiedAt: string | null }>;
  getChannelBindings: (platformUserId: string) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
};

function buildMessagesOpenUrl(): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  return `${base}${routePaths.patientMessages}`;
}

function previewText(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function messengerBody(text: string, openUrl: string): string {
  const body = previewText(text, 500);
  return body ? `${body}\n\n${openUrl}` : openUrl;
}

async function buildAvailability(
  deps: NotifyPatientDoctorReplyDeps,
  platformUserId: string,
): Promise<PatientNotificationChannelAvailability> {
  const [emailFields, bindings, vapidKeys, smtp, subs] = await Promise.all([
    deps.getProfileEmailFields(platformUserId),
    deps.getChannelBindings(platformUserId),
    getWebPushVapidKeyPair(deps.systemSettings),
    deps.systemSettings.getSetting("smtp_outbound", "admin"),
    deps.webPushSubscriptions.listActiveByUserId(platformUserId),
  ]);
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  return {
    hasTelegram: Boolean(bindings.telegramId?.trim()),
    hasMax: Boolean(bindings.maxId?.trim()),
    hasEmail: Boolean(emailFields.email?.trim()),
    emailVerified: Boolean(emailFields.emailVerifiedAt),
    hasWebPushSubscription: subs.length > 0,
    vapidConfigured: Boolean(vapidKeys),
    smtpConfigured: smtpParsed?.success === true,
  };
}

/**
 * Fan-out ответа врача: Web Push, Telegram/MAX (relay-outbound), email.
 * Fire-and-forget из `sendAdminReply`; ошибки логируются, не пробрасываются.
 */
export function createNotifyPatientDoctorReply(deps: NotifyPatientDoctorReplyDeps) {
  return async function notifyPatientDoctorReply(params: NotifyPatientDoctorReplyParams): Promise<void> {
    const { platformUserId, messageId, text } = params;
    const openUrl = buildMessagesOpenUrl();
    const trimmed = text.trim();
    if (!trimmed) return;

    const topicCode = params.topicCode?.trim() || NOTIFICATION_TOPIC_SPECIALIST_MESSAGES;
    const [prefs, availability, topicRows, gate] = await Promise.all([
      deps.channelPreferences.getPreferences(platformUserId),
      buildAvailability(deps, platformUserId),
      deps.topicChannelPrefs.listByUserId(platformUserId),
      deps.readReminderNotifyGate(platformUserId, topicCode),
    ]);
    const { selectedChannels } = resolvePatientNotificationChannels({
      topicCode,
      availability,
      channelPrefs: prefs,
      topicChannelRows: topicRows,
      gate: { muted: gate.muted, topicMasterEnabled: true },
    });

    const verbose = await isOperationalVerboseLogEnabled({ systemSettings: deps.systemSettings });
    if (verbose) {
      logger.info(
        {
          event: "patient_doctor_reply.notify",
          platformUserId,
          messageId,
          selectedChannels,
        },
        "patient doctor reply notify channels",
      );
    }

    const bindings = await deps.getChannelBindings(platformUserId);
    const relaySent = new Set<string>();

    const relayTo = async (channel: "telegram" | "max", recipient: string) => {
      const dedupKey = `${channel}:${recipient}`;
      if (relaySent.has(dedupKey)) return;
      relaySent.add(dedupKey);
      await relayOutbound(
        {
          messageId: `${messageId}:${channel}`,
          channel,
          recipient,
          text: messengerBody(trimmed, openUrl),
          userId: platformUserId,
        },
        deps,
      );
    };

    const tasks: Promise<unknown>[] = [];

    if (selectedChannels.includes("telegram") && bindings.telegramId?.trim()) {
      tasks.push(
        relayTo("telegram", bindings.telegramId.trim()).catch((err: unknown) => {
          logger.error({ err, platformUserId, channel: "telegram" }, "doctor reply relay telegram failed");
        }),
      );
    }
    if (selectedChannels.includes("max") && bindings.maxId?.trim()) {
      tasks.push(
        relayTo("max", bindings.maxId.trim()).catch((err: unknown) => {
          logger.error({ err, platformUserId, channel: "max" }, "doctor reply relay max failed");
        }),
      );
    }

    if (selectedChannels.includes("web_push")) {
      const vapidKeys = await getWebPushVapidKeyPair(deps.systemSettings);
      if (vapidKeys) {
        const subs = await deps.webPushSubscriptions.listActiveByUserId(platformUserId);
        const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
        const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
        const vapidSubject =
          smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
            `mailto:${smtpParsed.data.from}`
          : "mailto:noreply@invalid";
        tasks.push(
          sendWebPushToSubscriptions({
            subscriptions: subs,
            vapidPublicKey: vapidKeys.publicKey,
            vapidPrivateKey: vapidKeys.privateKey,
            vapidSubject,
            payload: {
              ...buildMessagePushCopy(trimmed),
              url: openUrl,
              tag: `doctor_reply:${messageId}`,
            },
            onSubscriptionDead: async (endpoint) => {
              await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
            },
            verbose,
            logContext: { userId: platformUserId },
          }).catch((err: unknown) => {
            logger.error({ err, platformUserId }, "doctor reply web push failed");
          }),
        );
      }
    }

    if (selectedChannels.includes("email")) {
      const emailFields = await deps.getProfileEmailFields(platformUserId);
      const to = emailFields.email?.trim();
      if (to && emailFields.emailVerifiedAt) {
        const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
        const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
        const listUnsubscribe =
          smtpParsed?.success === true && smtpParsed.data.from.includes("@") ?
            `<mailto:${smtpParsed.data.from.trim()}?subject=unsubscribe>`
          : null;
        // S10: relay email through integrator dispatchPort (redirect-covered) instead of direct SMTP.
        tasks.push(
          relayOutbound(
            {
              messageId: `${messageId}:email`,
              channel: "email",
              recipient: to,
              text: `${previewText(trimmed, 2000)}\n\n${openUrl}`,
              metadata: {
                subject: EMAIL_SUBJECT,
                ...(listUnsubscribe ? { listUnsubscribe } : {}),
              },
            },
            deps,
          ).then((res) => {
            if (!res.ok) {
              logger.warn({ platformUserId, error: res.reason }, "doctor reply email failed");
            }
          }),
        );
      }
    }

    await Promise.all(tasks);
  };
}
