/**
 * Patient-facing titles for notification topics (`notifications_topics.id` / mailing topic codes).
 * DB titles stay unchanged; this map is the product copy on the profile.
 */
const TOPIC_DISPLAY_TITLE: Record<string, string> = {
  warmup_reminders: "Разминки",
  training_reminders: "Тренировки",
  appointment_reminders: "Запись на прием",
  patient_news: "Новости и уведомления",
  specialist_messages: "Сообщения специалиста",
  support_messages: "Сообщения поддержки",
  important_broadcasts: "Важные рассылки",
};

export function patientNotificationTopicDisplayTitle(topicId: string, adminTitle: string): string {
  const key = topicId.trim();
  return TOPIC_DISPLAY_TITLE[key] ?? adminTitle;
}
