import type { ReminderRule } from "@/modules/reminders/types";

/** JSON shape returned by patient reminder APIs (create/PATCH responses). */
export type PatientReminderRuleJson = {
  id: string;
  category: ReminderRule["category"];
  enabled: boolean;
  intervalMinutes: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  linkedObjectType: ReminderRule["linkedObjectType"];
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  updatedAt: string;
};

export function reminderRuleToPatientJson(r: ReminderRule): PatientReminderRuleJson {
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
