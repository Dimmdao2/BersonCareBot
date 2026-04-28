/**
 * In-memory реализация ReminderRulesPort для юнит-тестов.
 *
 * Семантическое упрощение: `listByPlatformUser(platformUserId)` ищет по полю `integratorUserId`
 * правила в хранилище. Это работает в тестах, где оба ID намеренно совпадают.
 * Реальная PG-реализация использует JOIN `platform_users` для корректного resolve.
 */
import { randomUUID } from "node:crypto";
import type { ReminderRulesPort } from "@/modules/reminders/ports";
import type { ReminderCategory, ReminderLinkedObjectType, ReminderRule, ReminderUpdateSchedule } from "@/modules/reminders/types";

const FALLBACK_CATEGORIES = new Set(["appointment", "lfk", "chat", "important"]);

function mapLinkedTypeToCategory(linked: ReminderLinkedObjectType): ReminderCategory {
  if (linked === "lfk_complex" || linked === "content_section") return "lfk";
  return "important";
}

export function createInMemoryReminderRulesPort(
  initial: ReminderRule[] = [],
): ReminderRulesPort {
  const store: Map<string, ReminderRule> = new Map(initial.map((r) => [r.id, r]));

  const getRulesForUser = (platformUserId: string): ReminderRule[] =>
    Array.from(store.values()).filter((r) => r.integratorUserId === platformUserId);

  return {
    async resolveIntegratorUserId(platformUserId) {
      return platformUserId;
    },

    async listByPlatformUser(platformUserId) {
      return getRulesForUser(platformUserId).sort((a, b) =>
        a.category.localeCompare(b.category),
      );
    },

    async listByPlatformUserWithObjects(platformUserId) {
      return getRulesForUser(platformUserId).sort(
        (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
      );
    },

    async getByPlatformUserAndCategory(platformUserId, category) {
      return (
        getRulesForUser(platformUserId).find((r) => r.category === category) ?? null
      );
    },

    async create(input) {
      const id = `wp-${randomUUID()}`;
      const category = mapLinkedTypeToCategory(input.linkedObjectType);
      const rule: ReminderRule = {
        id,
        integratorUserId: input.integratorUserId,
        category,
        enabled: input.enabled,
        timezone: "Europe/Moscow",
        intervalMinutes: input.schedule.intervalMinutes,
        windowStartMinute: input.schedule.windowStartMinute,
        windowEndMinute: input.schedule.windowEndMinute,
        daysMask: input.schedule.daysMask,
        fallbackEnabled: FALLBACK_CATEGORIES.has(category),
        linkedObjectType: input.linkedObjectType,
        linkedObjectId: input.linkedObjectId,
        customTitle: input.customTitle,
        customText: input.customText,
        updatedAt: new Date().toISOString(),
      };
      store.set(id, rule);
      return rule;
    },

    async delete(ruleIntegratorId, platformUserId) {
      const rule = store.get(ruleIntegratorId);
      if (!rule || rule.integratorUserId !== platformUserId) return false;
      store.delete(ruleIntegratorId);
      return true;
    },

    async updateEnabled(ruleIntegratorId, enabled) {
      const rule = store.get(ruleIntegratorId);
      if (rule) store.set(ruleIntegratorId, { ...rule, enabled, updatedAt: new Date().toISOString() });
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
          updatedAt: new Date().toISOString(),
        });
      }
    },

    async updateCustomTexts(ruleIntegratorId, customTitle, customText) {
      const rule = store.get(ruleIntegratorId);
      if (rule) {
        store.set(ruleIntegratorId, {
          ...rule,
          customTitle,
          customText,
          updatedAt: new Date().toISOString(),
        });
      }
    },
  };
}
