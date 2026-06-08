import type { BroadcastCategory } from "@/modules/doctor-broadcasts/ports";

/** Canonical `notifications_topics.id` values — keep aligned with DEFAULT_NOTIFICATION_TOPICS. */
export const NOTIFICATION_TOPIC_WARMUP = "warmup_reminders";
export const NOTIFICATION_TOPIC_TRAINING = "training_reminders";
export const NOTIFICATION_TOPIC_APPOINTMENT = "appointment_reminders";
export const NOTIFICATION_TOPIC_PATIENT_NEWS = "patient_news";
export const NOTIFICATION_TOPIC_SPECIALIST_MESSAGES = "specialist_messages";
export const NOTIFICATION_TOPIC_SUPPORT_MESSAGES = "support_messages";
export const NOTIFICATION_TOPIC_IMPORTANT_BROADCASTS = "important_broadcasts";

/** Legacy ids kept for migration/backfill only. */
export const LEGACY_NOTIFICATION_TOPIC_EXERCISE = "exercise_reminders";
export const LEGACY_NOTIFICATION_TOPIC_NEWS = "news";

const IMPORTANT_BROADCAST_CATEGORIES = new Set<BroadcastCategory>([
  "service",
  "organizational",
  "important_notice",
]);

export function broadcastNotificationTopicCode(category: BroadcastCategory): string {
  return IMPORTANT_BROADCAST_CATEGORIES.has(category) ?
      NOTIFICATION_TOPIC_IMPORTANT_BROADCASTS
    : NOTIFICATION_TOPIC_PATIENT_NEWS;
}
