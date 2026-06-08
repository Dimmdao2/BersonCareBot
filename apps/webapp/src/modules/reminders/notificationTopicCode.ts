/**
 * Maps patient-facing mailing topic ids (`notifications_topics.id` / `system_settings.notifications_topics`)
 * onto reminder rules. Integrator `ReminderCategory` alone cannot encode appointment vs exercise UX topics.
 */
import type { ReminderRule } from "./types";
import {
  NOTIFICATION_TOPIC_APPOINTMENT,
  NOTIFICATION_TOPIC_TRAINING,
  NOTIFICATION_TOPIC_WARMUP,
} from "@/modules/patient-notifications/notificationTopicCodes";

/** @deprecated use NOTIFICATION_TOPIC_* from notificationTopicCodes */
export const REMINDER_NOTIFICATION_TOPIC_EXERCISE = NOTIFICATION_TOPIC_TRAINING;
export const REMINDER_NOTIFICATION_TOPIC_APPOINTMENT = NOTIFICATION_TOPIC_APPOINTMENT;

/**
 * Stored on `reminder_rules.notification_topic_code` and synced to integrator `user_reminder_rules`.
 * Returns null when delivery must not be filtered by per-topic prefs (e.g. «важное»).
 */
export function notificationTopicCodeFromReminderRule(
  rule: Pick<ReminderRule, "category" | "linkedObjectType"> &
    Partial<Pick<ReminderRule, "reminderIntent">>,
): string | null {
  if (rule.category === "appointment") return NOTIFICATION_TOPIC_APPOINTMENT;
  if (rule.category === "important") return null;
  const intent =
    typeof rule.reminderIntent === "string" ? rule.reminderIntent.trim().toLowerCase() : "";
  if (intent === "warmup") return NOTIFICATION_TOPIC_WARMUP;
  if (rule.category === "lfk") return NOTIFICATION_TOPIC_TRAINING;
  const lot = rule.linkedObjectType;
  if (
    lot === "rehab_program" ||
    lot === "treatment_program_item" ||
    lot === "lfk_complex" ||
    lot === "content_page" ||
    lot === "content_section"
  ) {
    return intent === "warmup" ? NOTIFICATION_TOPIC_WARMUP : NOTIFICATION_TOPIC_TRAINING;
  }
  return null;
}
