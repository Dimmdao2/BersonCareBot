/** Default when caller omits zone (e.g. unit tests). Production paths pass DB-resolved IANA id. */
const DEFAULT_BOOKING_DISPLAY_TZ = 'Europe/Moscow';

/** Formats an ISO instant for patient/doctor booking messages in a fixed business timezone. */
export function formatBookingRuDateTime(value: string | null, timeZone: string = DEFAULT_BOOKING_DISPLAY_TZ): string {
  if (!value) return 'без даты';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}
