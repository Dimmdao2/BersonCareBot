import type {
  ReminderProjectionPort,
  ReminderRuleListItem,
} from '@/modules/reminders/projectionPort';

/**
 * In-memory projection reads used when no runtime DB is configured.
 *
 * Track D (#987): the two `*FromProjection` upserts were removed from the port — they were the
 * retired M2M write path, keyed by the retired public identity, with no production callers. Without
 * a writer there is nothing to seed, so every read below is empty rather than fake.
 */
const rulesByIntegratorRuleId = new Map<string, ReminderRuleListItem>();

export const inMemoryReminderProjectionPort: ReminderProjectionPort = {
  async listRulesByPlatformUserId(platformUserId: string) {
    return Array.from(rulesByIntegratorRuleId.values())
      .filter((r) => r.userId === platformUserId)
      .sort((a, b) => a.category.localeCompare(b.category));
  },

  async getRuleByPlatformUserIdAndCategory(platformUserId: string, category: string) {
    return (
      Array.from(rulesByIntegratorRuleId.values()).find(
        (x) => x.userId === platformUserId && x.category === category,
      ) ?? null
    );
  },

  async listHistoryByPlatformUserId(_platformUserId: string, _limit = 50) {
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
