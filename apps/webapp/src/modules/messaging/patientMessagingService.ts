/**
 * Сообщения поддержки для пациента (webapp thread `webapp:platform:{userId}`).
 */
import type { SupportCommunicationPort, SupportConversationMessageRow } from "@/infra/repos/pgSupportCommunication";

const MAX_LEN = 4000;

export type PatientMessagingServiceOptions = {
  /** Если true — пациент не может отправлять сообщения (этап 9, `platform_users.is_blocked`). */
  isUserMessagingBlocked?: (platformUserId: string) => Promise<boolean>;
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
      const messages = await port.listMessagesSince(id, { sinceCreatedAt: null, limit: 100 });
      return { conversationId: id, messages };
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
      return { messages };
    },

    async sendText(platformUserId: string, conversationId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
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
      await port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: "user",
        text: trimmed,
        source: "webapp",
        createdAt: now,
      });
      return { ok: true };
    },

    async markInboundRead(platformUserId: string, conversationId: string): Promise<void> {
      await port.markInboundReadForUser(conversationId, platformUserId);
    },

    unreadCount(platformUserId: string): Promise<number> {
      return port.countUnreadForUser(platformUserId);
    },
  };
}
