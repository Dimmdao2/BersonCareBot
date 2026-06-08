import { getAppBaseUrlSync } from "@/modules/system-settings/integrationRuntime";
import {
  loadDoctorNotifyTargets,
  relayTextToDoctorTargets,
} from "@/modules/messaging/doctorNotifyTargets";
import {
  notifyDoctorPatientMessageToStaff,
  type NotifyDoctorPatientMessageToStaffDeps,
} from "@/modules/doctor-notifications/notifyDoctorPatientMessageToStaff";
import { resolvePatientTelegramUsernameMention } from "@/app-layer/messaging/resolvePatientTelegramUsernameMention";
import { buildPatientNotifyFromLine } from "@/modules/messaging/patientTelegramUsernameMention";
import {
  isWebappPlatformConversationId,
  webappPlatformConversationId,
} from "@/modules/messaging/supportConversationIds";

export function buildDoctorMessagesOpenPath(platformUserId: string): string {
  const convKey = encodeURIComponent(webappPlatformConversationId(platformUserId));
  return `/app/doctor/messages?integratorConversationId=${convKey}`;
}

export function buildDoctorMessagesDeepLink(platformUserId: string): string {
  const base = getAppBaseUrlSync().replace(/\/$/, "");
  const path = buildDoctorMessagesOpenPath(platformUserId);
  if (!base) return path;
  return `${base}${path}`;
}

export function buildDoctorPatientMessageNotifyText(input: {
  patientLabel: string;
  messageText: string;
  source: "webapp" | "telegram" | "max";
  deepLink: string;
  replyConversationId: string;
  telegramUsernameMention?: string | null;
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
    `${buildPatientNotifyFromLine(input.patientLabel, input.telegramUsernameMention)}\n` +
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
  opts?: {
    staffDeps?: NotifyDoctorPatientMessageToStaffDeps;
    resolveTelegramUsernameMention?: (platformUserId: string) => Promise<string | null>;
  },
): Promise<void> {
  const deepLink = buildDoctorMessagesDeepLink(input.platformUserId);
  const openPath = buildDoctorMessagesOpenPath(input.platformUserId);
  const replyConversationId = doctorReplyCallbackConversationId(input.platformUserId);
  const resolveMention = opts?.resolveTelegramUsernameMention ?? resolvePatientTelegramUsernameMention;
  const telegramUsernameMention = await resolveMention(input.platformUserId).catch(() => null);
  const text = buildDoctorPatientMessageNotifyText({
    patientLabel: input.patientLabel,
    messageText: input.messageText,
    source: input.source,
    deepLink,
    replyConversationId,
    telegramUsernameMention,
  });
  const preview = input.messageText.trim().slice(0, 120);
  const replyMarkup = {
    inline_keyboard: [[{ text: "Ответить", callback_data: `admin_reply:${replyConversationId}` }]],
  };

  if (opts?.staffDeps) {
    void notifyDoctorPatientMessageToStaff(
      {
        topicCode: "doctor_patient_messages",
        messageId: `patient-msg-notify:${input.messageId}`,
        text,
        pushTitle: "Сообщение от пациента",
        pushBody: `${input.patientLabel}: ${preview}`,
        pushUrl: openPath,
        replyMarkup,
      },
      opts.staffDeps,
    ).catch((err: unknown) => {
      console.error("[notifyDoctorPatientMessage] staff notify error:", err);
    });
    return;
  }

  const targets = await loadDoctorNotifyTargets();
  if (targets.telegram.length > 0 || targets.max.length > 0) {
    await relayTextToDoctorTargets(
      `patient-msg-notify:${input.messageId}`,
      targets,
      text,
      "patient-msg-notify",
      replyMarkup,
    );
  }
}

export { isWebappPlatformConversationId };
