import type { SlotsV1ScheduleData } from "./scheduleSlots";

export type ReminderCategory =
  | "appointment"
  | "lfk"
  | "chat"
  | "important"
  | "broadcast";

/** Non-null variants for object-linked rules; null = legacy category-only rule. */
export type ReminderLinkedObjectType =
  | "lfk_complex"
  | "content_section"
  | "content_page"
  | "custom"
  | "rehab_program"
  | "treatment_program_item";

export type ReminderIntent = "warmup" | "exercises" | "stretch" | "generic";

export type ReminderRule = {
  /** integrator_rule_id (string, managed by integrator / webapp create) */
  id: string;
  integratorUserId: string;
  category: ReminderCategory;
  enabled: boolean;
  intervalMinutes: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  /** Bitmask Mon–Sun as 7-char string, e.g. '1111111' */
  daysMask: string;
  /** IANA timezone for schedule evaluation (matches integrator reminder_rules.timezone). */
  timezone: string;
  /** Derived from category policy (USER_TODO_STAGE §4). */
  fallbackEnabled: boolean;
  linkedObjectType: ReminderLinkedObjectType | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  /** interval_window | slots_v1 */
  scheduleType: string;
  scheduleData: SlotsV1ScheduleData | null;
  reminderIntent: ReminderIntent;
  displayTitle: string | null;
  displayDescription: string | null;
  /** Minute 0-1439; both null = quiet hours off */
  quietHoursStartMinute: number | null;
  /** Minute 1-1440 end-exclusive style; both null = quiet hours off */
  quietHoursEndMinute: number | null;
  updatedAt: string;
};

export type ReminderUpdateSchedule = {
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
};

export type ReminderUpdateScheduleExtended =
  | ({ scheduleType: "interval_window" } & ReminderUpdateSchedule)
  | { scheduleType: "slots_v1"; scheduleData: SlotsV1ScheduleData; timezone?: string };
