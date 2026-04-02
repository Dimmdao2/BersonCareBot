import type { ReminderRule } from "@/modules/reminders/types";

export function reminderRuleToPatientJson(r: ReminderRule) {
  return {
    id: r.id,
    category: r.category,
    enabled: r.enabled,
    intervalMinutes: r.intervalMinutes,
    windowStartMinute: r.windowStartMinute,
    windowEndMinute: r.windowEndMinute,
    daysMask: r.daysMask,
    linkedObjectType: r.linkedObjectType,
    linkedObjectId: r.linkedObjectId,
    customTitle: r.customTitle,
    customText: r.customText,
    updatedAt: r.updatedAt,
  };
}
