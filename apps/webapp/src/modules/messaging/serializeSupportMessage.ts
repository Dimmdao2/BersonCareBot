import type { SupportConversationMessageRow } from "@/infra/repos/pgSupportCommunication";

/** JSON-совместимое представление сообщения для API/UI. */
export function serializeSupportMessage(m: SupportConversationMessageRow) {
  return {
    id: m.id,
    integratorMessageId: m.integratorMessageId,
    conversationId: m.conversationId,
    senderRole: m.senderRole,
    messageType: m.messageType,
    text: m.text,
    source: m.source,
    createdAt: m.createdAt,
    readAt: m.readAt,
    deliveredAt: m.deliveredAt,
    mediaUrl: m.mediaUrl,
    mediaType: m.mediaType,
  };
}

export type SerializedSupportMessage = ReturnType<typeof serializeSupportMessage>;
