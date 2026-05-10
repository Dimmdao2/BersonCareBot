/**
 * Patient-facing titles for notification topics (`notifications_topics.id` / mailing topic codes).
 * DB titles stay unchanged; this map is the product copy on the profile.
 */
const TOPIC_DISPLAY_TITLE: Record<string, string> = {
  exercise_reminders: "Разминки и упражнения",
  symptom_reminders: "Дневник самочувствия",
  appointment_reminders: "Запись на прием",
};

export function patientNotificationTopicDisplayTitle(topicId: string, adminTitle: string): string {
  const key = topicId.trim();
  return TOPIC_DISPLAY_TITLE[key] ?? adminTitle;
}
