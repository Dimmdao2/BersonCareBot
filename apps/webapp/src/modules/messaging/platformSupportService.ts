import { isSupportChatMessage } from "@/shared/lib/supportMessageKinds";

export type PlatformSupportConversation = {
  conversationId: string;
  organizationId: string | null;
  organizationTitle: string | null;
  source: string;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  channelCode: string | null;
  lastMessageText: string;
  lastSenderRole: string;
  lastMessageIntegratorId: string;
  lastMessageSource: string;
  messageCount: number;
};

export type PlatformSupportMessage = {
  id: string;
  integratorMessageId: string;
  senderRole: string;
  messageType: string;
  text: string;
  source: string;
  createdAt: string;
  mediaUrl: string | null;
  mediaType: string | null;
};

export type PlatformSupportConversationDetail = {
  conversation: PlatformSupportConversation;
  messages: PlatformSupportMessage[];
};

export type PlatformSupportPort = {
  listPlatformSupportConversations(params: {
    unansweredOnly: boolean;
    limit: number;
  }): Promise<PlatformSupportConversation[]>;
  getPlatformSupportConversation(
    conversationId: string,
  ): Promise<PlatformSupportConversationDetail | null>;
};

export function createPlatformSupportService(port: PlatformSupportPort) {
  return {
    async listConversations(params: {
      unansweredOnly?: boolean;
      limit?: number;
    }): Promise<PlatformSupportConversation[]> {
      const unansweredOnly = params.unansweredOnly === true;
      const limit = Math.min(Math.max(params.limit ?? 100, 1), 100);
      const rows = await port.listPlatformSupportConversations({ unansweredOnly, limit });

      // Defence in depth: the repository performs the same exclusion in SQL, while this
      // boundary keeps an accidentally returned delivery copy out of the platform API.
      return rows
        .filter((row) =>
          isSupportChatMessage({
            integratorMessageId: row.lastMessageIntegratorId,
            source: row.lastMessageSource,
          }),
        )
        .filter((row) => !unansweredOnly || row.lastSenderRole === "user");
    },

    async getConversation(
      conversationId: string,
    ): Promise<PlatformSupportConversationDetail | null> {
      const result = await port.getPlatformSupportConversation(conversationId);
      if (!result) return null;

      const messages = result.messages.filter((message) =>
        isSupportChatMessage({
          integratorMessageId: message.integratorMessageId,
          source: message.source,
        }),
      );
      if (messages.length === 0) return null;

      return { conversation: result.conversation, messages };
    },
  };
}
