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

/** Узкий порт webapp-владельца для канонических вопросов поддержки и журнала доставки. */
export type IntegratorSupportQuestionOwnershipPort = {
  createQuestion(params: {
    integratorQuestionId: string;
    conversationId: string;
    organizationId: string;
    status: string;
    createdAt: string;
  }): Promise<{ id: string }>;
  appendQuestionMessage(params: {
    integratorQuestionMessageId: string;
    integratorQuestionId: string;
    organizationId: string;
    senderRole: 'user' | 'admin';
    text: string;
    createdAt: string;
  }): Promise<{ id: string; created: boolean }>;
  markQuestionAnswered(params: {
    integratorQuestionId: string;
    organizationId: string;
    answeredAt: string;
  }): Promise<void>;
  recordDeliveryAttempt(params: {
    organizationId: string;
    integratorIntentEventId: string | null;
    correlationId: string | null;
    channelCode: string;
    status: string;
    attempt: number;
    reason: string | null;
    payloadJson: Record<string, unknown>;
    occurredAt: string;
  }): Promise<{ id: string; created: boolean }>;
};
