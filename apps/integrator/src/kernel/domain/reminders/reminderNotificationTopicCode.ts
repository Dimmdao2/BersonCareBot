import type { ReminderCategory, ReminderRuleRecord } from '../../contracts/reminders.js';

const EXERCISE_TOPIC = 'exercise_reminders';

/**
 * Webapp `notifications_topics.id` for `GET /api/integrator/delivery-targets?topic=`.
 * Used to filter telegram/max fan-out by per-topic prefs (`user_notification_topic_channels`).
 *
 * Precedence: persisted `rule.notificationTopicCode` (from webapp) > legacy heuristic on intent/category.
 *
 * **`water`:** integrator category for webapp «важное» (`integratorCategoryFromRule`). Must not inherit
 * `exercise_reminders` from `reminderIntent === 'generic'` — delivery stays without per-topic filtering.
 */
export function reminderOccurrenceTopicCode(
  rule: ReminderRuleRecord | undefined,
  occCategory: ReminderCategory,
): string | undefined {
  const explicit =
    typeof rule?.notificationTopicCode === 'string' ? rule.notificationTopicCode.trim() : '';
  if (explicit.length > 0) return explicit;

  if (rule?.category === 'water') {
    return undefined;
  }

  if (rule) {
    const intent = typeof rule.reminderIntent === 'string' ? rule.reminderIntent.trim().toLowerCase() : '';
    if (intent === 'warmup' || intent === 'exercises' || intent === 'stretch' || intent === 'generic') {
      return EXERCISE_TOPIC;
    }
    const lot = typeof rule.linkedObjectType === 'string' ? rule.linkedObjectType.trim() : '';
    if (
      lot === 'rehab_program' ||
      lot === 'treatment_program_item' ||
      lot === 'lfk_complex' ||
      lot === 'content_page' ||
      lot === 'content_section'
    ) {
      return EXERCISE_TOPIC;
    }
  }
  switch (occCategory) {
    case 'exercise':
    case 'warmup':
    case 'breathing':
      return EXERCISE_TOPIC;
    default:
      return undefined;
  }
}
