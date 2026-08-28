/**
 * Track D final cutover (#987) removed `appendFinalizedOccurrenceFromProjection` — its sole target,
 * `app.record_reminder_occurrence_finalized_projection`, was a cross-schema finalize-projection
 * root with zero live callers; the integrator now finalizes an occurrence with one write directly
 * to the single physical occurrence store (`markReminderOccurrenceSent`/`Failed` in
 * `apps/integrator/src/infra/db/repos/reminders.ts`), so there is nothing left to project.
 */
export type ReminderProjectionPort = {
  /**
   * Track D (#987) also removed `upsertRuleFromProjection` and
   * `upsertContentAccessGrantFromProjection`. They were the write half of the same retired M2M
   * projection: keyed by `integrator_user_id`, they were the only writers of that column into
   * `reminder_rules` / `content_access_grants_webapp`, and they had zero production callers — the
   * integrator writes reminder rules through the patient/webapp roots instead. Do not reintroduce
   * them under another name.
   *
   * The reads below are keyed by canonical `public.platform_users.id`.
   */
  listRulesByPlatformUserId(platformUserId: string): Promise<ReminderRuleListItem[]>;
  getRuleByPlatformUserIdAndCategory(
    platformUserId: string,
    category: string,
  ): Promise<ReminderRuleListItem | null>;
  listHistoryByPlatformUserId(
    platformUserId: string,
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
  /** Canonical `public.platform_users.id` owning the rule. */
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
