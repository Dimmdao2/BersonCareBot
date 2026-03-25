export type ReminderCategory =
  | "appointment"
  | "lfk"
  | "chat"
  | "important"
  | "broadcast";

export type ReminderRule = {
  /** integrator_rule_id (string, managed by integrator) */
  id: string;
  integratorUserId: string;
  category: ReminderCategory;
  enabled: boolean;
  intervalMinutes: number | null;
  windowStartMinute: number;
  windowEndMinute: number;
  /** Bitmask Mon–Sun as 7-char string, e.g. '1111111' */
  daysMask: string;
  /** Derived from category policy (USER_TODO_STAGE §4). */
  fallbackEnabled: boolean;
  updatedAt: string;
};

export type ReminderUpdateSchedule = {
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
};
