import { DEFAULT_APP_DISPLAY_TIMEZONE } from '../../config/appTimezone.js';

/** Formats an ISO instant for patient/doctor booking messages in a fixed business timezone. */
export function formatBookingRuDateTime(value: string | null, timeZone: string = DEFAULT_APP_DISPLAY_TIMEZONE): string {
  if (!value) return 'без даты';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  });
}
