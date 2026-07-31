/**
 * D14(3): вебапп составляет дословный текст пациентского сообщения для события жизненного цикла
 * записи — интегратор его больше не сочиняет, только доставляет. Тексты и форматирование даты
 * здесь — точная копия того, что раньше строил интегратор
 * (`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts`), это перенос поведения,
 * а не новый текст. Формат даты специально не переиспользует `shared/lib/formatBusinessDateTime.ts`
 * (там иная нормализация пробелов для UI) — здесь важно побайтово повторить прежний вывод интегратора.
 */

function formatPatientMessageDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function buildPatientCreatedMessageText(
  input: { slotStart: string; bookingType: 'in_person' | 'online'; city?: string | null; cityCodeSnapshot?: string | null },
  timeZone: string,
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  const typeLabel = input.bookingType === 'online' ? 'Онлайн' : 'Очный приём';
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
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  const typeLabel = input.bookingType === 'online' ? 'Онлайн' : 'Очный приём';
  return `Запись перенесена на ${dateLabel}\n${typeLabel}`;
}

export function buildPatientPaymentCapturedMessageText(
  input: { slotStart: string },
  timeZone: string,
): string {
  const dateLabel = formatPatientMessageDateTime(input.slotStart, timeZone);
  return `Оплата записи подтверждена. ${dateLabel}`;
}
