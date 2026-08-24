import type {
  ReminderProjectionPort,
  ReminderRuleListItem,
} from '@/modules/reminders/projectionPort';
import { buildReminderDeepLink } from '@/modules/reminders/buildReminderDeepLink';
import { env } from '@/config/env';

const rulesByIntegratorRuleId = new Map<string, ReminderRuleListItem>();
const contentGrantsByIntegratorGrantId = new Map<string, unknown>();

export const inMemoryReminderProjectionPort: ReminderProjectionPort = {
  async upsertRuleFromProjection(params) {
    const item: ReminderRuleListItem = {
      id: params.integratorRuleId,
      userId: params.integratorUserId,
      category: params.category,
      isEnabled: params.isEnabled,
      scheduleType: params.scheduleType,
      timezone: params.timezone,
      intervalMinutes: params.intervalMinutes,
      windowStartMinute: params.windowStartMinute,
      windowEndMinute: params.windowEndMinute,
      daysMask: params.daysMask,
      contentMode: params.contentMode,
      linkedObjectType: null,
      linkedObjectId: null,
      customTitle: null,
      customText: null,
      deepLink: buildReminderDeepLink({
        linkedObjectType: null,
        linkedObjectId: null,
        appBaseUrl: env.APP_BASE_URL,
      }),
      scheduleData: null,
      reminderIntent: null,
      displayTitle: null,
      displayDescription: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      notificationTopicCode: null,
      updatedAt: params.updatedAt,
    };
    rulesByIntegratorRuleId.set(params.integratorRuleId, item);
  },

  async upsertContentAccessGrantFromProjection(params) {
    contentGrantsByIntegratorGrantId.set(params.integratorGrantId, params);
  },

  async listRulesByIntegratorUserId(integratorUserId: string) {
    return Array.from(rulesByIntegratorRuleId.values())
      .filter((r) => r.userId === integratorUserId)
      .sort((a, b) => a.category.localeCompare(b.category));
  },

  async getRuleByIntegratorUserIdAndCategory(integratorUserId: string, category: string) {
    return (
      Array.from(rulesByIntegratorRuleId.values()).find(
        (x) => x.userId === integratorUserId && x.category === category,
      ) ?? null
    );
  },

  async listHistoryByIntegratorUserId(_integratorUserId: string, _limit = 50) {
    return [];
  },

  async getUnseenCount(_platformUserId: string) {
    return 0;
  },

  async getStats(_platformUserId: string, _days: number) {
    return { total: 0, seen: 0, unseen: 0, failed: 0 };
  },

  async markSeen(_platformUserId: string, _occurrenceIds: string[]) {
    // no-op in memory
  },

  async markAllSeen(_platformUserId: string) {
    // no-op in memory
  },
};
