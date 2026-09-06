/**
 * Owner: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §34 «Часовой пояс: у человека — определяется,
 * у места — настраивается». Приём в филиале показывается во времени МЕСТА; красное предупреждение
 * появляется только когда UTC-смещение филиала на момент записи отличается от смещения устройства
 * пациента — оба вычисляются для конкретного instant записи (сезонные переходы, дробные смещения).
 */
import { DateTime } from 'luxon';
import { parseBusinessInstant } from './formatBusinessDateTime';

/**
 * UTC-смещение (в минутах) IANA-таймзоны `timeZone` в момент `iso`. `iso` разбирается тем же
 * safety-net правилом, что и остальной бизнес-рендер (`parseBusinessInstant`): наивная
 * wall-clock строка трактуется как настенное время `timeZone`, а не теряется.
 * `null` — невалидный `iso` или `timeZone`.
 */
export function getUtcOffsetMinutesAtInstant(iso: string, timeZone: string): number | null {
  const zone = timeZone.trim();
  if (!zone) return null;
  const instant = parseBusinessInstant(iso, zone);
  if (Number.isNaN(instant.getTime())) return null;
  const dt = DateTime.fromJSDate(instant).setZone(zone);
  return dt.isValid ? dt.offset : null;
}

/** Компактная подпись `UTC+3` / `UTC-4` / `UTC+5:30` (целые часы без минут). */
export function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0
    ? `UTC${sign}${hours}`
    : `UTC${sign}${hours}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Канонический пояс отображения записи: пояс филиала, если он известен, иначе действующий
 * фолбэк приложения (`system_settings.app_display_timezone`). Легаси-строки без канонического
 * филиала не подменяются — вызывающая сторона передаёт `null`/`undefined`.
 */
export function resolveAppointmentTimeZone(
  branchTimeZone: string | null | undefined,
  fallbackTimeZone: string,
): string {
  return branchTimeZone?.trim() || fallbackTimeZone;
}

export type AppointmentZoneWarning = { offsetLabel: string };

/**
 * Предупреждение о расхождении поясов (owner: `PATIENT-OVERVIEW-09/10`) — только когда
 * UTC-смещения филиала и устройства пациента на момент записи различаются; иначе `null`
 * (в т.ч. когда таймзона филиала/устройства неизвестна — не своими руками признак «легаси»
 * ряда без филиала).
 */
export function resolveAppointmentZoneWarning(
  iso: string,
  branchTimeZone: string | null | undefined,
  deviceTimeZone: string | null | undefined,
): AppointmentZoneWarning | null {
  const branch = branchTimeZone?.trim();
  const device = deviceTimeZone?.trim();
  if (!branch || !device) return null;
  const branchOffset = getUtcOffsetMinutesAtInstant(iso, branch);
  const deviceOffset = getUtcOffsetMinutesAtInstant(iso, device);
  if (branchOffset === null || deviceOffset === null) return null;
  if (branchOffset === deviceOffset) return null;
  return { offsetLabel: formatUtcOffsetLabel(branchOffset) };
}
