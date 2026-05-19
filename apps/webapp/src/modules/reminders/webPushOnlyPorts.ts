import type { ReminderCategory, ReminderLinkedObjectType } from "./types";

export type WebPushOnlyReminderRuleRow = {
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
  integratorRuleId: string;
  platformUserId: string;
  occurrenceKey: string;
  plannedAt: string;
};

export type WebPushOnlyRemindersPort = {
  listEnabledWebPushOnlyRules(nowIso: string): Promise<WebPushOnlyReminderRuleRow[]>;
  getRuleByIntegratorRuleId(integratorRuleId: string): Promise<WebPushOnlyReminderRuleRow | null>;
  upsertPlannedOccurrences(
    platformUserId: string,
    integratorRuleId: string,
    drafts: Array<{ occurrenceKey: string; plannedAt: string }>,
  ): Promise<number>;
  claimDueOccurrences(nowIso: string, limit: number): Promise<WebPushOnlyDueOccurrenceRow[]>;
  markOccurrenceSent(occurrenceId: string): Promise<void>;
  markOccurrenceFailed(occurrenceId: string, errorCode: string): Promise<void>;
  resolveLinkedCatalogTitle(
    linkedObjectType: string,
    linkedObjectId: string,
  ): Promise<string | null>;
};
