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
    mediaUrl?: string | null;
    mediaType?: string | null;
    organizationId?: string;
    externalChatId?: string | null;
    externalMessageId?: string | null;
  }): Promise<{ id: string; created: boolean }>;
};

/** Узкий webapp-owned порт канонической записи обращений, пришедших через integrator. */
export type IntegratorSupportOwnershipPort = PatientInboundChatPort & {
  setConversationStatusFromProjection(params: {
    integratorConversationId: string;
    status: string;
    lastMessageAt?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
  }): Promise<void>;
};
