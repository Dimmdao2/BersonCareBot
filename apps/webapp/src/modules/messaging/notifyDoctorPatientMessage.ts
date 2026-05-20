import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";
import {
  isWebappPlatformConversationId,
  webappPlatformConversationId,
} from "@/modules/messaging/supportConversationIds";

export function buildDoctorMessagesDeepLink(platformUserId: string): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  if (!base) return "/app/doctor/messages";
  const convKey = encodeURIComponent(webappPlatformConversationId(platformUserId));
  return `${base}/app/doctor/messages?integratorConversationId=${convKey}`;
}

export function buildDoctorPatientMessageNotifyText(input: {
  patientLabel: string;
  messageText: string;
  source: "webapp" | "telegram" | "max";
  deepLink: string;
  replyConversationId: string;
}): string {
  const sourceLabel =
    input.source === "webapp"
      ? "приложение"
      : input.source === "max"
        ? "MAX"
        : "Telegram";
  const preview = input.messageText.trim().slice(0, 500);
  const linkPart = input.deepLink ? `\nЧат: ${input.deepLink}` : "";
  return (
    `Новое сообщение от пациента (${sourceLabel})\n` +
    `От: ${input.patientLabel}\n` +
    `${preview}${linkPart}\n` +
    `(Ответьте кнопкой «Ответить» или в кабинете)`
  );
}

/** Inline callback для integrator: `admin_reply:webapp:platform:{uuid}`. */
export function doctorReplyCallbackConversationId(platformUserId: string): string {
  return webappPlatformConversationId(platformUserId);
}

export type NotifyDoctorPatientMessageInput = {
  platformUserId: string;
  messageId: string;
  messageText: string;
  patientLabel: string;
  source: "webapp" | "telegram" | "max";
};

export async function notifyDoctorPatientMessage(
  input: NotifyDoctorPatientMessageInput,
): Promise<void> {
  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length === 0 && targets.max.length === 0) return;

  const deepLink = buildDoctorMessagesDeepLink(input.platformUserId);
  const text = buildDoctorPatientMessageNotifyText({
    patientLabel: input.patientLabel,
    messageText: input.messageText,
    source: input.source,
    deepLink,
    replyConversationId: doctorReplyCallbackConversationId(input.platformUserId),
  });

  const replyConversationId = doctorReplyCallbackConversationId(input.platformUserId);
  const replyMarkup = {
    inline_keyboard: [[{ text: "Ответить", callback_data: `admin_reply:${replyConversationId}` }]],
  };

  await relayTextToDoctorTargets(
    `patient-msg-notify:${input.messageId}`,
    targets,
    text,
    "patient-msg-notify",
    replyMarkup,
  );
}

export { isWebappPlatformConversationId };
