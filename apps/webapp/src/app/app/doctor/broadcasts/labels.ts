import type { BroadcastAudienceFilter, BroadcastCategory } from "@/modules/doctor-broadcasts/ports";

/** Порядок опций в селекте аудитории (совпадает с `BroadcastAudienceSelect`). */
export const BROADCAST_AUDIENCE_FILTERS_ORDER: readonly BroadcastAudienceFilter[] = [
  "all",
  "active_clients",
  "with_upcoming_appointment",
  "without_appointment",
  "with_telegram",
  "with_max",
  "sms_only",
  "inactive",
] as const;

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

/** Сегменты без полноценного фильтра в `DoctorClientsPort`: число получателей = все клиенты (TODO в buildAppDeps). */
export function isAudienceEstimateApproximate(filter: BroadcastAudienceFilter): boolean {
  return filter === "inactive" || filter === "sms_only";
}

const APPROXIMATE_AUDIENCE_SUFFIX = " (оценка, фильтр в разработке)";

/** Подпись опции в селекте аудитории (с пометкой для неполных сегментов). */
export function getAudienceOptionLabel(filter: BroadcastAudienceFilter): string {
  const base = AUDIENCE_LABELS[filter];
  return isAudienceEstimateApproximate(filter) ? `${base}${APPROXIMATE_AUDIENCE_SUFFIX}` : base;
}

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
