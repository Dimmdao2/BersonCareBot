export type ReminderProjectionPort = {
  upsertRuleFromProjection(params: {
    integratorRuleId: string;
    integratorUserId: string;
    category: string;
    isEnabled: boolean;
    scheduleType: string;
    timezone: string;
    intervalMinutes: number;
    windowStartMinute: number;
    windowEndMinute: number;
    daysMask: string;
    contentMode: string;
    updatedAt: string;
  }): Promise<void>;
  appendFinalizedOccurrenceFromProjection(params: {
    integratorOccurrenceId: string;
    integratorRuleId: string;
    integratorUserId: string;
    platformUserId: string;
    organizationId: string;
    category: string;
    status: 'sent' | 'failed';
    deliveryChannel: string | null;
    errorCode: string | null;
    occurredAt: string;
  }): Promise<void>;
  appendDeliveryEventFromProjection(params: {
    integratorDeliveryLogId: string;
    integratorOccurrenceId: string;
    integratorRuleId: string;
    integratorUserId: string;
    channel: string;
    status: string;
    errorCode: string | null;
    payloadJson: Record<string, unknown>;
    createdAt: string;
  }): Promise<void>;
  upsertContentAccessGrantFromProjection(params: {
    integratorGrantId: string;
    integratorUserId: string;
    contentId: string;
    purpose: string;
    tokenHash: string | null;
    expiresAt: string;
    revokedAt: string | null;
    metaJson: Record<string, unknown>;
    createdAt: string;
  }): Promise<void>;
  listRulesByIntegratorUserId(integratorUserId: string): Promise<ReminderRuleListItem[]>;
  getRuleByIntegratorUserIdAndCategory(
    integratorUserId: string,
    category: string,
  ): Promise<ReminderRuleListItem | null>;
  listHistoryByIntegratorUserId(
    integratorUserId: string,
    limit?: number,
  ): Promise<ReminderOccurrenceHistoryItem[]>;
  getUnseenCount(platformUserId: string): Promise<number>;
  getStats(
    platformUserId: string,
    days: number,
  ): Promise<{ total: number; seen: number; unseen: number; failed: number }>;
  markSeen(platformUserId: string, occurrenceIds: string[]): Promise<void>;
  markAllSeen(platformUserId: string): Promise<void>;
};

export type ReminderRuleListItem = {
  id: string;
  userId: string;
  category: string;
  isEnabled: boolean;
  scheduleType: string;
  timezone: string;
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  contentMode: string;
  linkedObjectType: string | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  deepLink: string;
  scheduleData: Record<string, unknown> | null;
  reminderIntent: string | null;
  displayTitle: string | null;
  displayDescription: string | null;
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  notificationTopicCode: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ReminderOccurrenceHistoryItem = {
  id: string;
  ruleId: string;
  status: 'sent' | 'failed';
  deliveryChannel: string | null;
  errorCode: string | null;
  occurredAt: string;
};
