import type { ReminderCategory, ReminderLinkedObjectType } from './types';

export type WebPushOnlyReminderRuleRow = {
  organizationId: string;
  integratorRuleId: string;
  platformUserId: string;
  category: ReminderCategory;
  isEnabled: boolean;
  scheduleType: string;
  timezone: string;
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  scheduleData: unknown;
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
  notificationTopicCode: string | null;
  linkedObjectType: ReminderLinkedObjectType | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  displayTitle: string | null;
  reminderIntent: string | null;
};

export type WebPushOnlyDueOccurrenceRow = {
  id: string;
  organizationId: string;
  integratorRuleId: string;
  platformUserId: string;
  occurrenceKey: string;
  plannedAt: string;
};

export type WebPushOnlyRemindersPort = {
  listOrganizationIds(nowIso: string): Promise<string[]>;
  listEnabledWebPushOnlyRules(
    organizationId: string,
    nowIso: string,
  ): Promise<WebPushOnlyReminderRuleRow[]>;
  getRuleByIntegratorRuleId(
    organizationId: string,
    integratorRuleId: string,
  ): Promise<WebPushOnlyReminderRuleRow | null>;
  upsertPlannedOccurrences(
    organizationId: string,
    platformUserId: string,
    integratorRuleId: string,
    drafts: Array<{ occurrenceKey: string; plannedAt: string }>,
  ): Promise<number>;
  claimDueOccurrences(
    organizationId: string,
    nowIso: string,
    limit: number,
  ): Promise<WebPushOnlyDueOccurrenceRow[]>;
  markOccurrenceSent(organizationId: string, occurrenceId: string): Promise<void>;
  markOccurrenceFailed(
    organizationId: string,
    occurrenceId: string,
    errorCode: string,
  ): Promise<void>;
  resolveLinkedCatalogTitle(
    linkedObjectType: string,
    linkedObjectId: string,
  ): Promise<string | null>;
  expireOrphanedPendingOccurrences(organizationId: string, nowIso: string): Promise<number>;
};
