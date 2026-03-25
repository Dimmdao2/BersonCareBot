/**
 * Просмотр диалогов поддержки врачом (MVP: все открытые диалоги из projection).
 */
import type { SupportCommunicationPort } from "@/infra/repos/pgSupportCommunication";
import type { AdminConversationListRow, SupportConversationMessageRow } from "@/infra/repos/pgSupportCommunication";
import { relayOutbound, type RelayOutboundDeps } from "./relayOutbound";

const MAX_LEN = 4000;

export type DoctorSupportMessagingServiceOpts = RelayOutboundDeps;

export function createDoctorSupportMessagingService(
  port: SupportCommunicationPort,
  opts?: DoctorSupportMessagingServiceOpts,
) {
  return {
    listOpenConversations(params: { limit?: number }): Promise<AdminConversationListRow[]> {
      return port.listOpenConversationsForAdmin({ limit: params.limit ?? 50 });
    },

    async getMessages(
      conversationId: string,
      params: { sinceCreatedAt?: string | null; limit?: number }
    ): Promise<{ messages: SupportConversationMessageRow[] } | null> {
      const exists = await port.conversationExists(conversationId);
      if (!exists) return null;
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
      const convInfo = await port.getConversationRelayInfo(conversationId);
      if (!convInfo) return { ok: false, error: "not_found" };
      const trimmed = text.trim();
      if (!trimmed) return { ok: false, error: "empty" };
      if (trimmed.length > MAX_LEN) return { ok: false, error: "too_long" };
      const integratorMessageId = `webapp-msg:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const channelCode = convInfo.channelCode ?? null;
      const channelExternalId = convInfo.channelExternalId ?? null;
      const platformUserId = convInfo.platformUserId ?? null;

      await port.appendWebappMessage({
        conversationId,
        integratorMessageId,
        senderRole: "admin",
        text: trimmed,
        source: "webapp",
        createdAt: now,
      });

      // Fire-and-forget relay — ошибка не ломает sendAdminReply
      if (channelCode && channelExternalId) {
        relayOutbound(
          {
            messageId: integratorMessageId,
            channel: channelCode,
            recipient: channelExternalId,
            text: trimmed,
            userId: platformUserId ?? undefined,
          },
          opts,
        ).catch((err: unknown) => {
          console.error("[doctorSupport] relay error:", err);
        });
      }

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
