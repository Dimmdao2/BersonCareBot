import { logger } from "@/app-layer/logging/logger";
import type { ChannelPreferencesPort } from "@/modules/channel-preferences/ports";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import type { TopicChannelPrefsPort } from "@/modules/patient-notifications/topicChannelPrefsPort";
import type { SystemSettingsService } from "@/modules/system-settings/service";
import { getWebPushVapidKeyPair } from "@/modules/system-settings/webPushVapidRuntime";
import type { WebPushSubscriptionsPort } from "@/modules/web-push/ports";
import { defaultDoctorTopicFallbackChannels } from "./doctorTopicChannelDefaults";
import { resolveDoctorNotificationChannels } from "./resolveDoctorNotificationChannels";
import type { StaffUsersPort } from "./staffUsersPort";

const TOPIC_CODE = "doctor_patient_messages";

export type NotifyDoctorPatientMessageToStaffDeps = {
  staffUsers: StaffUsersPort;
  topicChannelPrefs: TopicChannelPrefsPort;
  channelPreferences: ChannelPreferencesPort;
  webPushSubscriptions: WebPushSubscriptionsPort;
  systemSettings: Pick<SystemSettingsService, "getSetting">;
  getChannelBindings: (
    platformUserId: string,
  ) => Promise<{ telegramId?: string | null; maxId?: string | null }>;
};

export type NotifyDoctorPatientMessageToStaffInput = {
  messageId: string;
  text: string;
  pushTitle: string;
  pushBody: string;
  pushUrl: string;
  replyConversationId: string;
};

export type NotifyDoctorPatientMessageToStaffResult = {
  telegramDelivered: number;
  maxDelivered: number;
  pushDelivered: number;
};

export async function notifyDoctorPatientMessageToStaff(
  input: NotifyDoctorPatientMessageToStaffInput,
  deps: NotifyDoctorPatientMessageToStaffDeps,
): Promise<NotifyDoctorPatientMessageToStaffResult> {
  const vapid = await getWebPushVapidKeyPair(deps.systemSettings);
  const staffIds = await deps.staffUsers.listActiveStaffUserIds();
  const globalFallback = defaultDoctorTopicFallbackChannels(TOPIC_CODE);
  const replyMarkup = {
    inline_keyboard: [[{ text: "Ответить", callback_data: `admin_reply:${input.replyConversationId}` }]],
  };

  let telegramDelivered = 0;
  let maxDelivered = 0;
  let pushDelivered = 0;

  if (staffIds.length === 0) {
    return { telegramDelivered, maxDelivered, pushDelivered };
  }

  const { sendWebPushToSubscriptions } = vapid
    ? await import("@/modules/web-push/sendWebPushToSubscriptions")
    : { sendWebPushToSubscriptions: null };
  const { smtpInnerFromValueJson } = await import("@/modules/outbound-email/sendTransactionalSmtp");
  const smtp = await deps.systemSettings.getSetting("smtp_outbound", "admin");
  const smtpParsed = smtp?.valueJson ? smtpInnerFromValueJson(smtp.valueJson) : null;
  const vapidSubject =
    smtpParsed?.success === true && smtpParsed.data.from.includes("@")
      ? `mailto:${smtpParsed.data.from}`
      : "mailto:noreply@invalid";

  for (const userId of staffIds) {
    const [prefRows, channelPrefs, bindings, hasPush, subs] = await Promise.all([
      deps.topicChannelPrefs.listByUserId(userId),
      deps.channelPreferences.getPreferences(userId),
      deps.getChannelBindings(userId),
      deps.webPushSubscriptions.hasAnyForUserId(userId),
      deps.webPushSubscriptions.listActiveByUserId(userId),
    ]);

    const channels = resolveDoctorNotificationChannels({
      topicCode: TOPIC_CODE,
      availability: {
        hasTelegram: Boolean(bindings.telegramId?.trim()),
        hasMax: Boolean(bindings.maxId?.trim()),
        hasEmail: false,
        emailVerified: false,
        hasWebPushSubscription: hasPush,
        vapidConfigured: Boolean(vapid),
      },
      channelPrefs,
      topicChannelRows: prefRows,
      globalFallbackChannels: globalFallback,
    });

    if (channels.includes("telegram") && bindings.telegramId?.trim()) {
      const recipient = bindings.telegramId.trim();
      const result = await relayOutbound({
        messageId: `patient-msg-notify:${input.messageId}:tg:${userId}:${recipient}`,
        channel: "telegram",
        recipient,
        text: input.text,
        userId,
        replyMarkup,
      }).catch((err: unknown) => {
        logger.warn({ err, userId }, "doctor patient message staff telegram failed");
        return { ok: false as const, reason: "exception" };
      });
      if (result.ok) telegramDelivered += 1;
    }

    if (channels.includes("max") && bindings.maxId?.trim()) {
      const recipient = bindings.maxId.trim();
      const result = await relayOutbound({
        messageId: `patient-msg-notify:${input.messageId}:max:${userId}:${recipient}`,
        channel: "max",
        recipient,
        text: input.text,
        userId,
        replyMarkup,
      }).catch((err: unknown) => {
        logger.warn({ err, userId }, "doctor patient message staff max failed");
        return { ok: false as const, reason: "exception" };
      });
      if (result.ok) maxDelivered += 1;
    }

    if (channels.includes("web_push") && vapid && sendWebPushToSubscriptions && subs.length > 0) {
      const pushResult = await sendWebPushToSubscriptions({
        subscriptions: subs,
        vapidPublicKey: vapid.publicKey,
        vapidPrivateKey: vapid.privateKey,
        vapidSubject,
        payload: {
          title: input.pushTitle,
          body: input.pushBody,
          url: input.pushUrl,
          tag: `patient-msg:${input.messageId}`,
        },
        onSubscriptionDead: async (endpoint) => {
          await deps.webPushSubscriptions.deleteByEndpointIfExists(endpoint);
        },
        logContext: { userId },
      }).catch((err: unknown) => {
        logger.warn({ err, userId }, "doctor patient message staff web push failed");
        return { delivered: 0, errors: 1, deactivated: 0 };
      });
      pushDelivered += pushResult.delivered;
    }
  }

  return { telegramDelivered, maxDelivered, pushDelivered };
}
