/**
 * Человеко-понятные подписи для шаблонов уведомлений (event × audience)
 * и для доступных переменных подстановки. Используется на экране
 * «Тексты уведомлений» в кабинете доктора.
 */
import type {
  NotifTemplateEvent,
  NotifTemplateAudience,
} from "@/modules/notif-templates/notifTemplatesService";

export const NOTIF_EVENT_LABELS: Record<NotifTemplateEvent, string> = {
  created: "Подтверждение записи",
  cancelled: "Отмена записи",
  rescheduled: "Перенос записи",
};

export const NOTIF_AUDIENCE_LABELS: Record<NotifTemplateAudience, string> = {
  patient: "пациенту",
  doctor: "специалисту",
};

export function notifTemplateTitle(event: NotifTemplateEvent, audience: NotifTemplateAudience): string {
  return `${NOTIF_EVENT_LABELS[event]} → ${NOTIF_AUDIENCE_LABELS[audience]}`;
}

/** Подпись переменной для подсказки-чипа. */
export const NOTIF_VARIABLE_LABELS: Record<string, string> = {
  date: "дата и время",
  type: "тип приёма",
  city: "город / филиал",
  name: "имя пациента",
  phone: "телефон",
  reason: "причина отмены",
  organizationName: "название организации",
};
