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
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { DEFAULT_REHAB_DAILY_SLOTS } from "@/modules/reminders/scheduleSlots";
import { notificationTopicCodeFromReminderRule } from "@/modules/reminders/notificationTopicCode";

const FALLBACK_CATEGORIES = new Set(["appointment", "lfk", "chat", "important"]);

function mapLinkedTypeToCategory(linked: ReminderLinkedObjectType): ReminderCategory {
  if (
    linked === "lfk_complex" ||
    linked === "content_section" ||
    linked === "rehab_program" ||
    linked === "treatment_program_item"
  ) {
    return "lfk";
  }
  return "important";
}

export function createInMemoryReminderRulesPort(
  initial: ReminderRule[] = [],
): ReminderRulesPort {
  const store: Map<string, ReminderRule> = new Map(initial.map((r) => [r.id, r]));
  const muteUntilByPlatformUser = new Map<string, string | null>();

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
      const scheduleType = input.scheduleType ?? "interval_window";
      let scheduleData: SlotsV1ScheduleData | null = input.scheduleData ?? null;
      if (input.linkedObjectType === "rehab_program" && scheduleType === "slots_v1" && !scheduleData) {
        scheduleData = DEFAULT_REHAB_DAILY_SLOTS;
      }
      const rule: ReminderRule = {
        id,
        integratorUserId: input.integratorUserId,
        category,
        enabled: input.enabled,
        timezone: input.timezone?.trim() || "Europe/Moscow",
        intervalMinutes: input.schedule.intervalMinutes,
        windowStartMinute: input.schedule.windowStartMinute,
        windowEndMinute: input.schedule.windowEndMinute,
        daysMask: input.schedule.daysMask,
        fallbackEnabled: FALLBACK_CATEGORIES.has(category),
        linkedObjectType: input.linkedObjectType,
        linkedObjectId: input.linkedObjectId,
        customTitle: input.customTitle,
        customText: input.customText,
        scheduleType,
        scheduleData,
        reminderIntent: input.reminderIntent ?? "generic",
        displayTitle: input.displayTitle ?? null,
        displayDescription: input.displayDescription ?? null,
        quietHoursStartMinute: input.quietHoursStartMinute ?? null,
        quietHoursEndMinute: input.quietHoursEndMinute ?? null,
        notificationTopicCode: notificationTopicCodeFromReminderRule({
          category,
          linkedObjectType: input.linkedObjectType,
        }),
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

    async updateScheduleAndType(ruleIntegratorId, params) {
      const rule = store.get(ruleIntegratorId);
      if (rule) {
        store.set(ruleIntegratorId, {
          ...rule,
          scheduleType: params.scheduleType,
          intervalMinutes: params.intervalMinutes,
          windowStartMinute: params.windowStartMinute,
          windowEndMinute: params.windowEndMinute,
          daysMask: params.daysMask,
          scheduleData: params.scheduleData as SlotsV1ScheduleData | null,
          quietHoursStartMinute: params.quietHoursStartMinute,
          quietHoursEndMinute: params.quietHoursEndMinute,
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

    async updateDisplayTexts(ruleIntegratorId, displayTitle, displayDescription) {
      const rule = store.get(ruleIntegratorId);
      if (rule) {
        store.set(ruleIntegratorId, {
          ...rule,
          displayTitle,
          displayDescription,
          updatedAt: new Date().toISOString(),
        });
      }
    },

    async setReminderMutedUntil(platformUserId, untilIso) {
      muteUntilByPlatformUser.set(platformUserId, untilIso);
    },

    async getReminderMutedUntil(platformUserId) {
      return muteUntilByPlatformUser.has(platformUserId)
        ? muteUntilByPlatformUser.get(platformUserId) ?? null
        : null;
    },

    async retargetContentPageLinkedSlug(_contentPageId: string, oldSlug: string, newSlug: string) {
      const oldT = oldSlug.trim();
      if (!oldT) return;
      for (const [id, rule] of store) {
        if (rule.linkedObjectType !== "content_page") continue;
        const rid = rule.linkedObjectId?.trim();
        if (!rid || rid !== oldT) continue;
        store.set(id, { ...rule, linkedObjectId: newSlug, updatedAt: new Date().toISOString() });
      }
    },
  };
}
