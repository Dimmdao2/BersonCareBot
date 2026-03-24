/**
 * Просмотр диалогов поддержки врачом (MVP: все открытые диалоги из projection).
 */
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import type { AdminConversationListRow, SupportConversationMessageRow } from "@/infra/repos/pgSupportCommunication";
import { maybeRelayOutbound } from "./relayOutbound";

const MAX_LEN = 4000;

export function createDoctorSupportMessagingService(port: SupportCommunicationPort) {
  return {
    listOpenConversations(params: { limit?: number }): Promise<AdminConversationListRow[]> {
      return port.listOpenConversationsForAdmin({ limit: params.limit ?? 50 });
    },

    async getMessages(
      conversationId: string,
      params: { sinceCreatedAt?: string | null; limit?: number }
    ): Promise<{ messages: SupportConversationMessageRow[] } | null> {
      const data = await port.getConversationWithMessages(conversationId);
      if (!data) return null;
      const messages = await port.listMessagesSince(conversationId, {
        sinceCreatedAt: params.sinceCreatedAt ?? null,
        limit: params.limit ?? 100,
      });
      return { messages };
    },

    async sendAdminReply(
      conversationId: string,
      text: string
    ): Promise<{ ok: true } | { ok: false; error: string }> {
      const data = await port.getConversationWithMessages(conversationId);
      if (!data) return { ok: false, error: "not_found" };
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "empty" };
      if (trimmed.length > MAX_LEN) return { ok: false, error: "too_long" };
      const integratorMessageId = `webapp-msg:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      await port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: "admin",
        text: trimmed,
        source: "webapp",
        createdAt: now,
      });
      await maybeRelayOutbound({ kind: "admin", text: trimmed });
      return { ok: true };
    },

    markUserMessagesRead(conversationId: string): Promise<void> {
      return port.markUserMessagesReadByAdmin(conversationId);
    },

    unreadFromUsers(): Promise<number> {
      return port.countUnreadUserMessagesForAdmin();
    },
  };
}
