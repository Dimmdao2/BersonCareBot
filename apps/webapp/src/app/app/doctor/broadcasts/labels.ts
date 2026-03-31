import type { BroadcastAudienceFilter, BroadcastCategory } from "@/modules/doctor-broadcasts/ports";

export const AUDIENCE_LABELS: Record<BroadcastAudienceFilter, string> = {
  all: "Все клиенты",
  active_clients: "Активные клиенты",
  with_upcoming_appointment: "С будущей записью",
  without_appointment: "Без записи",
  with_telegram: "Telegram-пользователи",
  with_max: "MAX-пользователи",
  sms_only: "Только SMS",
  inactive: "Неактивные (90+ дней)",
};

export const CATEGORY_LABELS: Record<BroadcastCategory, string> = {
  service: "Сервисное",
  organizational: "Организационное",
  marketing: "Маркетинговое",
  important_notice: "Важное уведомление",
  schedule_change: "Изменение расписания",
  reminder: "Напоминание",
  education: "Образовательное",
  survey: "Опрос",
};

export function formatAudienceLabel(filter: BroadcastAudienceFilter): string {
  return AUDIENCE_LABELS[filter] ?? filter;
}

export function formatCategoryLabel(category: BroadcastCategory): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function formatBroadcastDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}
