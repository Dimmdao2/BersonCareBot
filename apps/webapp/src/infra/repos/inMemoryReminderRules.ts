/**
 * In-memory реализация ReminderRulesPort для юнит-тестов.
 *
 * Семантическое упрощение: `listByPlatformUser(platformUserId)` ищет по полю `integratorUserId`
 * правила в хранилище. Это работает в тестах, где оба ID намеренно совпадают.
 * Реальная PG-реализация использует JOIN `platform_users` для корректного resolve.
 */
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type { ReminderRule, ReminderUpdateSchedule } from "@/modules/reminders/types";

export function createInMemoryReminderRulesPort(
  initial: ReminderRule[] = [],
): ReminderRulesPort {
  const store: Map<string, ReminderRule> = new Map(initial.map((r) => [r.id, r]));

  const getRulesForUser = (platformUserId: string): ReminderRule[] =>
    Array.from(store.values()).filter(
      (r) => r.integratorUserId === platformUserId,
    );

  return {
    async listByPlatformUser(platformUserId) {
      return getRulesForUser(platformUserId).sort((a, b) =>
        a.category.localeCompare(b.category),
      );
    },

    async getByPlatformUserAndCategory(platformUserId, category) {
      return (
        getRulesForUser(platformUserId).find((r) => r.category === category) ?? null
      );
    },

    async updateEnabled(ruleIntegratorId, enabled) {
      const rule = store.get(ruleIntegratorId);
      if (rule) store.set(ruleIntegratorId, { ...rule, enabled });
    },

    async updateSchedule(ruleIntegratorId, schedule: ReminderUpdateSchedule) {
      const rule = store.get(ruleIntegratorId);
      if (rule) {
        store.set(ruleIntegratorId, {
          ...rule,
          intervalMinutes: schedule.intervalMinutes,
          windowStartMinute: schedule.windowStartMinute,
          windowEndMinute: schedule.windowEndMinute,
          daysMask: schedule.daysMask,
        });
      }
    },
  };
}
