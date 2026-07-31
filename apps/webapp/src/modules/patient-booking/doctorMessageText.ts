/**
 * D14(4): вебапп составляет дословный текст врачебного уведомления для события жизненного цикла
 * записи — интегратор его больше не сочиняет, только доставляет. Тексты и форматирование даты
 * здесь — точная копия того, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`), это перенос поведения,
 * а не новый текст. См. `patientMessageText.ts` — тот же приём для пациентских сообщений (D14(3)).
 */

function formatDoctorMessageDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function buildDoctorCreatedMessageText(
  input: { slotStart: string; contactName?: string | null; contactPhone?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatDoctorMessageDateTime(input.slotStart, timeZone);
  const name = input.contactName?.trim() || 'Пациент';
  const phone = input.contactPhone?.trim() || 'без телефона';
  return `Новая запись: ${name}, ${phone}\nДата: ${dateLabel}`;
}

export function buildDoctorCancelledMessageText(
  input: { slotStart: string; contactName?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatDoctorMessageDateTime(input.slotStart, timeZone);
  const name = input.contactName?.trim() || 'Пациент';
  return `Отмена записи: ${name}\nДата: ${dateLabel}`;
}

export function buildDoctorRescheduledMessageText(
  input: { slotStart: string; contactName?: string | null; contactPhone?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatDoctorMessageDateTime(input.slotStart, timeZone);
  const name = input.contactName?.trim() || 'Пациент';
  const phone = input.contactPhone?.trim() || 'без телефона';
  return `Перенос записи: ${name}, ${phone}\nНовая дата: ${dateLabel}`;
}

export function buildDoctorPaymentCapturedMessageText(
  input: { slotStart: string; contactName?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatDoctorMessageDateTime(input.slotStart, timeZone);
  const name = input.contactName?.trim() || 'пациент';
  return `Оплата записи: ${name}, ${dateLabel}`;
}
