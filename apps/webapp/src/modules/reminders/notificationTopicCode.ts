/**
 * Maps patient-facing mailing topic ids (`notifications_topics.id` / `system_settings.notifications_topics`)
 * onto reminder rules. Integrator `ReminderCategory` alone cannot encode appointment vs exercise UX topics.
 */
import type { ReminderRule } from "./types";

/** Canonical ids — must stay aligned with {@link DEFAULT_NOTIFICATION_TOPICS}. */
export const REMINDER_NOTIFICATION_TOPIC_EXERCISE = "exercise_reminders";
export const REMINDER_NOTIFICATION_TOPIC_APPOINTMENT = "appointment_reminders";

/**
 * Stored on `reminder_rules.notification_topic_code` and synced to integrator `user_reminder_rules`.
 * Returns null when delivery must not be filtered by per-topic prefs (e.g. «важное»), or when unknown —
 * fallback heuristic applies in integrator.
 *
 * **`symptom_reminders`:** there is no reminder-rule category that maps to this topic yet; the function
 * returns null (no false positives) until a dedicated domain signal exists.
 */
export function notificationTopicCodeFromReminderRule(
  rule: Pick<ReminderRule, "category" | "linkedObjectType">,
): string | null {
  if (rule.category === "appointment") return REMINDER_NOTIFICATION_TOPIC_APPOINTMENT;
  if (rule.category === "important") return null;
  if (rule.category === "lfk") return REMINDER_NOTIFICATION_TOPIC_EXERCISE;
  const lot = rule.linkedObjectType;
  if (
    lot === "rehab_program" ||
    lot === "treatment_program_item" ||
    lot === "lfk_complex" ||
    lot === "content_page" ||
    lot === "content_section"
  ) {
    return REMINDER_NOTIFICATION_TOPIC_EXERCISE;
  }
  return null;
}
