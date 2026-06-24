/**
 * Запись входящего сообщения от клиники в канонический PWA-чат пациента.
 * Используется для рассылок, lifecycle записи и т.п. (без notifyPatientDoctorReply).
 */
import type { PatientInboundChatPort } from "@/modules/messaging/ports";

const MAX_TEXT_LEN = 4000;

export type AppendPatientInboundAdminMessageParams = {
  platformUserId: string;
  text: string;
  integratorMessageId: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
};

function truncateText(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_TEXT_LEN) return t;
  return `${t.slice(0, MAX_TEXT_LEN - 1)}…`;
}

export async function appendPatientInboundAdminMessage(
  port: PatientInboundChatPort,
  params: AppendPatientInboundAdminMessageParams,
): Promise<{ conversationId: string; messageId: string } | null> {
  const text = truncateText(params.text);
  if (!text && !params.mediaUrl) return null;

  await port.mergeLegacySupportConversationsForPlatformUser?.(params.platformUserId).catch((err: unknown) => {
    console.error("[appendPatientInboundAdminMessage] merge legacy error:", err);
  });

  const { id: conversationId } = await port.ensureWebappConversationForUser(params.platformUserId);
  const now = new Date().toISOString();
  const { id: messageId } = await port.appendWebappMessage({
    conversationId,
    integratorMessageId: params.integratorMessageId,
    senderRole: "admin",
    text,
    source: "webapp",
    createdAt: now,
    mediaUrl: params.mediaUrl ?? null,
    mediaType: params.mediaType ?? null,
  });

  if (!messageId) return null;
  return { conversationId, messageId };
}

/** Стабильный id для рассылки врача. */
export function broadcastChatIntegratorMessageId(auditId: string, platformUserId: string): string {
  return `broadcast:${auditId}:${platformUserId}`;
}

/** Стабильный id для lifecycle записи. */
export function bookingLifecycleChatIntegratorMessageId(
  variant: "created" | "cancelled" | "rescheduled",
  bookingId: string,
): string {
  return `booking-${variant}:${bookingId}`;
}
