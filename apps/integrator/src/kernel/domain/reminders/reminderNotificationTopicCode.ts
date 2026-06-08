import type { ReminderCategory, ReminderRuleRecord } from '../../contracts/reminders.js';

const WARMUP_TOPIC = 'warmup_reminders';
const TRAINING_TOPIC = 'training_reminders';

/**
 * Webapp `notifications_topics.id` for `GET /api/integrator/delivery-targets?topic=`.
 * Used to filter telegram/max fan-out by per-topic prefs (`user_notification_topic_channels`).
 * Parity regressions: `reminderNotificationTopicCode.parity.test.ts`.
 *
 * Precedence: persisted `rule.notificationTopicCode` (from webapp) > legacy heuristic on intent/category.
 *
 * **`water`:** integrator category for webapp «важное» (`integratorCategoryFromRule`). Must not inherit
 * exercise topics from `reminderIntent === 'generic'` — delivery stays without per-topic filtering.
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
    if (intent === 'warmup') return WARMUP_TOPIC;
    if (intent === 'exercises' || intent === 'stretch' || intent === 'generic') {
      return TRAINING_TOPIC;
    }
    const lot = typeof rule.linkedObjectType === 'string' ? rule.linkedObjectType.trim() : '';
    if (
      lot === 'rehab_program' ||
      lot === 'treatment_program_item' ||
      lot === 'lfk_complex' ||
      lot === 'content_page' ||
      lot === 'content_section'
    ) {
      return intent === 'warmup' ? WARMUP_TOPIC : TRAINING_TOPIC;
    }
  }
  switch (occCategory) {
    case 'warmup':
      return WARMUP_TOPIC;
    case 'exercise':
    case 'breathing':
      return TRAINING_TOPIC;
    default:
      return undefined;
  }
}
