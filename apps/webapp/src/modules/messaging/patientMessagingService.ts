/**
 * Сообщения поддержки для пациента (webapp thread `webapp:platform:{userId}`).
 */
import type { SupportCommunicationPort, SupportConversationMessageRow } from "@/infra/repos/pgSupportCommunication";
import { isSupportChatMessage } from "@/shared/lib/supportMessageKinds";
import { serializeSupportMessage, type SerializedSupportMessage } from "@/modules/messaging/serializeSupportMessage";

const MAX_LEN = 4000;

export type PatientMessagingServiceOptions = {
  /** Если true — пациент не может отправлять сообщения (этап 9, `platform_users.is_blocked`). */
  isUserMessagingBlocked?: (platformUserId: string) => Promise<boolean>;
  /** Уведомление врача в Telegram/Max после сообщения из PWA. */
  notifyDoctorOfPatientMessage?: (input: {
    platformUserId: string;
    messageId: string;
    messageText: string;
    patientLabel: string;
  }) => Promise<void>;
  resolvePatientLabel?: (platformUserId: string) => Promise<string>;
};

export function createPatientMessagingService(
  port: SupportCommunicationPort,
  options?: PatientMessagingServiceOptions
) {
  return {
    /** Гарантирует диалог и возвращает последние сообщения. */
    async bootstrap(platformUserId: string): Promise<{
      conversationId: string;
      messages: SupportConversationMessageRow[];
    }> {
      const { id } = await port.ensureWebappConversationForUser(platformUserId);
      await port.mergeLegacySupportConversationsForPlatformUser?.(platformUserId).catch((err: unknown) => {
        console.error("[patientMessaging] merge legacy conversations error:", err);
      });
      const messages = await port.listMessagesSince(id, { sinceCreatedAt: null, limit: 100 });
      return { conversationId: id, messages: messages.filter(isSupportChatMessage) };
    },

    /** Новые сообщения после `since` (для polling). */
    async pollNew(
      platformUserId: string,
      conversationId: string,
      sinceCreatedAt: string | null
    ): Promise<{ messages: SupportConversationMessageRow[] } | null> {
      const conv = await port.getConversationIfOwnedByUser(conversationId, platformUserId);
      if (!conv) return null;
      const messages = await port.listMessagesSince(conversationId, {
        sinceCreatedAt: sinceCreatedAt ?? undefined,
        limit: 80,
      });
      return { messages: messages.filter(isSupportChatMessage) };
    },

    async sendText(platformUserId: string, conversationId: string, text: string): Promise<
      | { ok: true; message: SerializedSupportMessage }
      | { ok: false; error: string }
    > {
      const conv = await port.getConversationIfOwnedByUser(conversationId, platformUserId);
      if (!conv) return { ok: false, error: "not_found" };
      if (options?.isUserMessagingBlocked) {
        const blocked = await options.isUserMessagingBlocked(platformUserId);
        if (blocked) return { ok: false, error: "blocked" };
      }
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "empty" };
      if (trimmed.length > MAX_LEN) return { ok: false, error: "too_long" };
      const integratorMessageId = `webapp-msg:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await port.mergeLegacySupportConversationsForPlatformUser?.(platformUserId).catch((err: unknown) => {
        console.error("[patientMessaging] merge legacy conversations error:", err);
      });
      const { id: targetConversationId } = await port.ensureWebappConversationForUser(platformUserId);

      const { id: messageId } = await port.appendWebappMessage({
        conversationId: targetConversationId,
        integratorMessageId,
        senderRole: "user",
        text: trimmed,
        source: "webapp",
        createdAt: now,
      });

      if (options?.notifyDoctorOfPatientMessage) {
        void (async () => {
          const patientLabel = options.resolvePatientLabel
            ? await options.resolvePatientLabel(platformUserId)
            : "Пациент";
          await options.notifyDoctorOfPatientMessage!({
            platformUserId,
            messageId: integratorMessageId,
            messageText: trimmed,
            patientLabel,
          });
        })().catch((err: unknown) => {
          console.error("[patientMessaging] doctor notify error:", err);
        });
      }

      const message: SupportConversationMessageRow = {
        id: messageId,
        integratorMessageId,
        conversationId: targetConversationId,
        senderRole: "user",
        messageType: "text",
        text: trimmed,
        source: "webapp",
        externalChatId: null,
        externalMessageId: null,
        deliveryStatus: null,
        createdAt: now,
        readAt: null,
        deliveredAt: now,
        mediaUrl: null,
        mediaType: null,
      };

      return { ok: true, message: serializeSupportMessage(message) };
    },

    async markInboundRead(platformUserId: string, conversationId: string): Promise<void> {
      await port.markInboundReadForUser(conversationId, platformUserId);
    },

    async unreadCount(platformUserId: string): Promise<number> {
      await port.mergeLegacySupportConversationsForPlatformUser?.(platformUserId).catch((err: unknown) => {
        console.error("[patientMessaging] merge legacy conversations error:", err);
      });
      return port.countUnreadForUser(platformUserId);
    },
  };
}
