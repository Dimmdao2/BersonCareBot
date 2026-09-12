/**
 * Человеко-понятные подписи для шаблонов уведомлений (event × audience)
 * и для доступных переменных подстановки. Используется на экране
 * «Тексты уведомлений» в кабинете доктора.
 */
import type {
  NotifTemplateEvent,
  NotifTemplateAudience,
} from '@/modules/notif-templates/notifTemplatesService';
import type { PatientTerms } from '@/modules/system-settings/patientTerms';

export const NOTIF_EVENT_LABELS: Record<NotifTemplateEvent, string> = {
  created: 'Подтверждение записи',
  cancelled: 'Отмена записи',
  rescheduled: 'Перенос записи',
};

export function notifTemplateTitle(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  terms: Pick<PatientTerms, 'patientDative'>,
): string {
  const audienceLabel = audience === 'patient' ? terms.patientDative : 'специалисту';
  return `${NOTIF_EVENT_LABELS[event]} → ${audienceLabel}`;
}

/** Подпись переменной для подсказки-чипа. */
export function notifVariableLabels(
  terms: Pick<PatientTerms, 'patientGenitive' | 'appointmentGenitive'>,
): Record<string, string> {
  return {
    date: 'дата и время',
    type: `тип ${terms.appointmentGenitive}`,
    city: 'город / филиал',
    name: `имя ${terms.patientGenitive}`,
    phone: 'телефон',
    reason: 'причина отмены',
    organizationName: 'название организации',
  };
}
