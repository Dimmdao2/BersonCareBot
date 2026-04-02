export type ReminderCategory =
  | "appointment"
  | "lfk"
  | "chat"
  | "important"
  | "broadcast";

/** Non-null variants for new object-linked rules; null = legacy category-only rule. */
export type ReminderLinkedObjectType = "lfk_complex" | "content_section" | "content_page" | "custom";

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
  /** Derived from category policy (USER_TODO_STAGE §4). */
  fallbackEnabled: boolean;
  linkedObjectType: ReminderLinkedObjectType | null;
  linkedObjectId: string | null;
  customTitle: string | null;
  customText: string | null;
  updatedAt: string;
};

export type ReminderUpdateSchedule = {
  intervalMinutes: number;
  windowStartMinute: number;
  windowEndMinute: number;
  daysMask: string;
};
