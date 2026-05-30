/** Узкий порт для записи входящих сообщений клиники в PWA-чат пациента. */
export type PatientInboundChatPort = {
  mergeLegacySupportConversationsForPlatformUser?(platformUserId: string): Promise<{
    mergedConversationCount: number;
    movedMessageCount: number;
  }>;
  ensureWebappConversationForUser(platformUserId: string): Promise<{ id: string }>;
  appendWebappMessage(params: {
    conversationId: string;
    integratorMessageId: string;
    senderRole: string;
    text: string;
    source: string;
    createdAt: string;
  }): Promise<{ id: string; created: boolean }>;
};
