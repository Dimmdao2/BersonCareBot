/**
 * D14(3): вебапп составляет дословный текст пациентского сообщения для события жизненного цикла
 * записи — интегратор его больше не сочиняет, только доставляет. Тексты и форматирование даты
 * здесь — точная копия того, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`), это перенос поведения,
 * а не новый текст. Формат даты специально не переиспользует `shared/lib/formatBusinessDateTime.ts`
 * (там иная нормализация пробелов для UI) — здесь важно побайтово повторить прежний вывод интегратора.
 *
 * T-F (терминология, решение владельца 12.09.2026): слово организации о событии записи приходит
 * сюда ОБЯЗАТЕЛЬНЫМ аргументом `terms`. Этот слой — текст: он не ходит в базу и настроек не читает,
 * значение читает вызывающий там, где организация уже известна. Аргумент обязателен намеренно:
 * необязательный оставил бы шаблон на «приёме» при зелёном `tsc` — ровно тот молчащий обход, что
 * закрывает `patientBookingLabels.ts` в кабинете клиента.
 */
import {
  appointmentDeliveryFormatLabels,
  type AppointmentMessageTerms,
} from '@/modules/system-settings/patientTerms';

function formatPatientMessageDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function buildPatientCreatedMessageText(
  input: {
    slotStart: string;
    bookingType: 'in_person' | 'online';
    city?: string | null;
    cityCodeSnapshot?: string | null;
  },
  timeZone: string,
  terms: AppointmentMessageTerms,
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  const typeLabel =
    input.bookingType === 'online' ? 'Онлайн' : appointmentDeliveryFormatLabels(terms).in_person;
  const city = input.cityCodeSnapshot?.trim() || input.city?.trim();
  const citySuffix = city ? ` (${city})` : '';
  return `Запись подтверждена: ${dateLabel}\n${typeLabel}${citySuffix}`;
}

export function buildPatientCancelledMessageText(
  input: { slotStart: string; reason?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  const reason = input.reason?.trim();
  return reason
    ? `Запись на ${dateLabel} отменена.\nПричина: ${reason}`
    : `Запись на ${dateLabel} отменена.`;
}

export function buildPatientRescheduledMessageText(
  input: { slotStart: string; bookingType: 'in_person' | 'online' },
  timeZone: string,
  terms: AppointmentMessageTerms,
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  const typeLabel =
    input.bookingType === 'online' ? 'Онлайн' : appointmentDeliveryFormatLabels(terms).in_person;
  return `Запись перенесена на ${dateLabel}\n${typeLabel}`;
}

/**
 * ⛔ Слово организации сюда НЕ приходит, и это не пропуск. Единственный вызывающий —
 * `app-layer/booking/appointmentPaymentConfirmedHandler.ts`, а он работает под ОРГАНИЗАЦИОННЫМ
 * принципалом вебхука эквайринга, которому дверь к `appointment_label` физически закрыта
 * (`readOrganizationAppointmentTerms`, замер на DEV 12.09.2026). Открывать новую дверь ради текста —
 * решение владельца, а не механическая правка; путь остаётся на платформенном «приёме».
 */
export function buildPatientPaymentCapturedMessageText(
  input:
    | { slotStart: string }
    | { appointments: readonly { slotStart: string; serviceTitle: string | null }[] },
  timeZone: string,
): string {
  const appointments =
    'appointments' in input
      ? input.appointments
      : [{ slotStart: input.slotStart, serviceTitle: null }];
  if (appointments.length === 1) {
    const appointment = appointments[0]!;
    return `Оплата записи подтверждена. ${formatPatientMessageDateTime(appointment.slotStart, timeZone)}`;
  }
  return `Оплата записи подтверждена. Вы записаны на приём:\n${appointments
    .map((appointment) => {
      const serviceTitle = appointment.serviceTitle?.trim() || 'Приём';
      return `• ${formatPatientMessageDateTime(appointment.slotStart, timeZone)} — ${serviceTitle}`;
    })
    .join('\n')}`;
}

/** Сообщение сразу после самозаписи с предоплатой: до оплаты запись ещё не подтверждена. */
export function buildPatientAwaitingPaymentMessageText(
  input: { checkoutUrl: string; paymentDeadlineAt: string },
  timeZone: string,
): string {
  const deadlineLabel = formatPatientMessageDateTime(input.paymentDeadlineAt, timeZone);
  return `Для подтверждения записи оплатите до ${deadlineLabel}:\n${input.checkoutUrl}`;
}
