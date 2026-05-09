import type { ReminderRule } from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";

/** JSON shape returned by patient reminder APIs (create/PATCH responses). */
export type PatientReminderRuleJson = {
  id: string;
  category: ReminderRule["category"];
  enabled: boolean;
  intervalMinutes: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
  scheduleType: string;
  scheduleData: SlotsV1ScheduleData | null;
  timezone: string;
  quietHoursStartMinute: number | null;
  quietHoursEndMinute: number | null;
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
    scheduleType: r.scheduleType ?? "interval_window",
    scheduleData: r.scheduleData,
    timezone: r.timezone?.trim() || "Europe/Moscow",
    quietHoursStartMinute: r.quietHoursStartMinute ?? null,
    quietHoursEndMinute: r.quietHoursEndMinute ?? null,
    linkedObjectType: r.linkedObjectType,
    linkedObjectId: r.linkedObjectId,
    customTitle: r.customTitle,
    customText: r.customText,
    updatedAt: r.updatedAt,
  };
}
