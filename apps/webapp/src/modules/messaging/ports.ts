import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

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

export type SupportConversationRow = {
  id: string;
  organizationId?: string | null;
  integratorConversationId: string;
  platformUserId: string | null;
  integratorUserId: string | null;
  source: string;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  channelCode: string | null;
  channelExternalId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportConversationRelayInfo = Pick<
  SupportConversationRow,
  'id' | 'organizationId' | 'platformUserId' | 'channelCode' | 'channelExternalId'
>;

export type SupportConversationMessageRow = {
  id: string;
  organizationId?: string | null;
  integratorMessageId: string;
  conversationId: string;
  senderRole: string;
  messageType: string;
  text: string;
  source: string;
  externalChatId: string | null;
  externalMessageId: string | null;
  deliveryStatus: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
};

export type SupportQuestionRow = {
  id: string;
  integratorQuestionId: string;
  conversationId: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  updatedAt: string;
};

export type SupportQuestionMessageRow = {
  id: string;
  integratorQuestionMessageId: string;
  questionId: string;
  senderRole: string;
  text: string;
  createdAt: string;
};

export type SupportDeliveryEventRow = {
  id: string;
  conversationMessageId: string | null;
  integratorIntentEventId: string | null;
  correlationId: string | null;
  channelCode: string;
  status: string;
  attempt: number;
  reason: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: string;
};

export type AdminConversationListRow = {
  /** Internal UUID `support_conversations.id` (этап 8) */
  conversationId: string;
  integratorConversationId: string;
  source: string;
  integratorUserId: string | null;
  adminScope: string;
  status: string;
  openedAt: string;
  lastMessageAt: string;
  closedAt: string | null;
  closeReason: string | null;
  displayName: string;
  phoneNormalized: string | null;
  channelExternalId: string | null;
  lastMessageText: string | null;
  lastSenderRole: string | null;
  unreadFromUserCount: number;
};

/** Support persistence contract consumed by the messaging module; implementations live in infra/repos. */
export type SupportCommunicationPort = {
  upsertConversationFromProjection(params: {
    integratorConversationId: string;
    integratorUserId: string | null;
    source: string;
    adminScope: string;
    status: string;
    openedAt: string;
    lastMessageAt: string;
    closedAt?: string | null;
    closeReason?: string | null;
    channelCode?: string | null;
    channelExternalId?: string | null;
  }): Promise<{ id: string }>;
  appendConversationMessageFromProjection(params: {
    integratorMessageId: string;
    integratorConversationId: string;
    senderRole: string;
    messageType?: string;
    text: string;
    source: string;
    externalChatId?: string | null;
    externalMessageId?: string | null;
    deliveryStatus?: string | null;
    createdAt: string;
  }): Promise<{ id: string }>;
  setConversationStatusFromProjection(params: {
    integratorConversationId: string;
    status: string;
    lastMessageAt?: string | null;
    closedAt?: string | null;
    closeReason?: string | null;
  }): Promise<void>;
  upsertQuestionFromProjection(params: {
    integratorQuestionId: string;
    integratorConversationId: string | null;
    status: string;
    createdAt: string;
    answeredAt?: string | null;
  }): Promise<{ id: string }>;
  appendQuestionMessageFromProjection(params: {
    integratorQuestionMessageId: string;
    integratorQuestionId: string;
    senderRole: string;
    text: string;
    createdAt: string;
  }): Promise<{ id: string }>;
  appendDeliveryEventFromProjection(params: {
    organizationId: string;
    conversationMessageId: string | null;
    integratorIntentEventId: string | null;
    correlationId: string | null;
    channelCode: string;
    status: string;
    attempt: number;
    reason: string | null;
    payloadJson: Record<string, unknown>;
    occurredAt: string;
  }): Promise<{ id: string }>;
  listConversationsByUser(platformUserId: string): Promise<SupportConversationRow[]>;
  getConversationWithMessages(
    conversationId: string,
    organizationId?: string,
  ): Promise<{ conversation: SupportConversationRow; messages: SupportConversationMessageRow[] } | null>;
  listQuestionsByUser(platformUserId: string): Promise<SupportQuestionRow[]>;
  listRecentDeliveryTrailForConversation(
    conversationId: string,
    limit?: number,
  ): Promise<SupportDeliveryEventRow[]>;
  listOpenConversationsForAdmin(params: {
    source?: string;
    limit?: number;
    unreadOnly?: boolean;
    organizationId?: string;
    visibilityActor: PatientVisibilityActor;
  }): Promise<AdminConversationListRow[]>;
  ensureWebappConversationForUser(
    platformUserId: string,
  ): Promise<{ id: string; organizationId?: string | null }>;
  mergeLegacySupportConversationsForPlatformUser?(platformUserId: string): Promise<{
    mergedConversationCount: number;
    movedMessageCount: number;
  }>;
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
  listMessagesSince(
    conversationId: string,
    params: { sinceCreatedAt?: string | null; limit: number; organizationId?: string },
  ): Promise<SupportConversationMessageRow[]>;
  conversationExists(conversationId: string, organizationId?: string): Promise<boolean>;
  getConversationRelayInfo(
    conversationId: string,
    organizationId?: string,
  ): Promise<SupportConversationRelayInfo | null>;
  getConversationIfOwnedByUser(
    conversationId: string,
    platformUserId: string,
  ): Promise<SupportConversationRow | null>;
  markInboundReadForUser(conversationId: string, platformUserId: string): Promise<void>;
  markInboundMessagesReadForUser(platformUserId: string, messageIds: string[]): Promise<void>;
  markNotificationMessagesReadForUser(platformUserId: string): Promise<void>;
  markUserMessagesReadByAdmin(conversationId: string, organizationId?: string): Promise<void>;
  countUnreadForUser(platformUserId: string): Promise<number>;
  countUnreadNotificationsForUser(platformUserId: string): Promise<number>;
  listUnreadInboundAdminMessagesForUser(
    platformUserId: string,
    conversationId: string,
  ): Promise<Array<{ id: string; text: string }>>;
  listNotificationMessagesForUser(
    platformUserId: string,
    limit: number,
  ): Promise<SupportConversationMessageRow[]>;
  countUnreadUserMessagesForAdmin(params: {
    organizationId?: string;
    visibilityActor: PatientVisibilityActor;
  }): Promise<number>;
  countUnreadUserMessagesForAdminByConversation(conversationId: string): Promise<number>;
  countUnreadUserMessagesForAdminByPatient(
    platformUserId: string,
    organizationId?: string,
  ): Promise<number>;
};
