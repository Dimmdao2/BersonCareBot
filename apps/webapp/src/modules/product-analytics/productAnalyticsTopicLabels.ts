import { DEFAULT_NOTIFICATION_TOPICS } from "@/modules/patient-notifications/notificationsTopics";

const EXTRA_TOPIC_LABELS: Record<string, string> = {
  warmup_reminder: "Разминка (тема напоминания)",
  booking_spb: "Запись на приём (booking)",
};

const defaultTopicTitleById = new Map(
  DEFAULT_NOTIFICATION_TOPICS.map((row) => [row.id, row.title] as const),
);

/** Human label for `product_push_notifications.topic_code` / hourly `topic_code`. */
export function labelProductAnalyticsTopicCode(topicCode: string): string {
  const code = topicCode.trim();
  if (!code) return "—";
  return (
    defaultTopicTitleById.get(code) ??
    EXTRA_TOPIC_LABELS[code] ??
    code.replaceAll("_", " ")
  );
}

/** Short legend for the usage analytics push block. */
export const PRODUCT_ANALYTICS_PUSH_TOPIC_HINT =
  "Тема — настройка уведомлений пациента. «Напоминания об упражнениях» включают разминки и тренировки (детализация по разминкам — в блоке «Слоганы разминки»). «Новости и обновления» — рассылки врача. Переписка со специалистом в push по темам не учитывается.";
