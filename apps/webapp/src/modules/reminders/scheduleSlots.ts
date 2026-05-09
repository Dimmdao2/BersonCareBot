/** slots_v1 JSON stored in reminder_rules.schedule_data (public schema). */
export type ReminderDayFilter = "weekdays" | "weekly_mask" | "every_n_days";

export type SlotsV1ScheduleData = {
  timesLocal: string[];
  dayFilter: ReminderDayFilter;
  /** Required when dayFilter === 'weekly_mask' */
  daysMask?: string;
  /** Required when dayFilter === 'every_n_days' */
  everyNDays?: number;
  anchorDate?: string;
};

export const DEFAULT_REHAB_WEEKDAY_SLOTS: SlotsV1ScheduleData = {
  timesLocal: ["12:00", "15:00", "17:00"],
  dayFilter: "weekdays",
};
