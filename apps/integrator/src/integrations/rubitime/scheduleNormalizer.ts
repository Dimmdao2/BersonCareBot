/**
 * Нормализует сырой ответ Rubitime api2/get-schedule в BookingSlotsByDate[].
 *
 * Rubitime возвращает:
 * {
 *   "2024-04-19": { "11:00": { "available": false }, "12:00": { "available": true } },
 *   "2024-04-20": { "11:00": { "available": true }, ... }
 * }
 *
 * Мы возвращаем только available=true слоты с ISO startAt/endAt.
 * endAt вычисляется как startAt + durationMinutes.
 *
 * Время в ответе Rubitime — настенные часы филиала. Интерпретация через IANA
 * `branchTimezone` (см. каталог филиалов / `branches.timezone`).
 *
 * Пустой массив `[]` в `data` (так иногда отвечает api2/get-schedule при отсутствии
 * доступных слотов) трактуем как пустое расписание — `[]`, без 502.
 *
 * Иной не-object (null, непустой массив, примитив) — бросаем ошибку, чтобы caller мог
 * вернуть 502, а не silent empty.
 */

import { normalizeToUtcInstant } from '../../shared/normalizeToUtcInstant.js';

export type NormalizedSlot = {
  startAt: string;
  endAt: string;
};

export type NormalizedSlotsByDate = {
  date: string;
  slots: NormalizedSlot[];
};

function isDateKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function buildIsoSlot(
  dateStr: string,
  timeStr: string,
  durationMinutes: number,
  branchTimezone: string,
): NormalizedSlot | null {
  // timeStr format: "HH:MM" (Rubitime docs)
  if (!/^\d{1,2}:\d{2}$/.test(timeStr)) return null;
  const [hourStr, minuteStr] = timeStr.split(':');
  if (!hourStr || !minuteStr) return null;
  const h = parseInt(hourStr, 10);
  const m = parseInt(minuteStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const hh = hourStr.padStart(2, '0');
  const mm = minuteStr.padStart(2, '0');
  const naiveWall = `${dateStr} ${hh}:${mm}:00`;
  const startUtc = normalizeToUtcInstant(naiveWall, branchTimezone);
  if (!startUtc) return null;
  const startMs = Date.parse(startUtc);
  if (!Number.isFinite(startMs)) return null;
  const end = new Date(startMs + durationMinutes * 60 * 1000);
  return { startAt: startUtc, endAt: end.toISOString() };
}

/**
 * @throws Error с кодом RUBITIME_SCHEDULE_MALFORMED_DATA если data не подходит по shape.
 */
export function normalizeRubitimeSchedule(
  data: unknown,
  durationMinutes: number,
  branchTimezone: string,
  dateFilter?: string,
): NormalizedSlotsByDate[] {
  if (data === null) {
    throw new Error('RUBITIME_SCHEDULE_MALFORMED_DATA: expected object, got null');
  }
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [];
    }
    throw new Error('RUBITIME_SCHEDULE_MALFORMED_DATA: expected object, got non-empty array');
  }
  if (typeof data !== 'object') {
    throw new Error(`RUBITIME_SCHEDULE_MALFORMED_DATA: expected object, got ${typeof data}`);
  }

  const result: NormalizedSlotsByDate[] = [];
  const dateMap = data as Record<string, unknown>;

  for (const [dateKey, timesRaw] of Object.entries(dateMap)) {
    if (!isDateKey(dateKey)) continue;
    if (dateFilter && dateKey !== dateFilter) continue;
    if (typeof timesRaw !== 'object' || timesRaw === null) continue;

    const times = timesRaw as Record<string, unknown>;
    const slots: NormalizedSlot[] = [];

    for (const [timeKey, slotRaw] of Object.entries(times)) {
      if (typeof slotRaw !== 'object' || slotRaw === null) continue;
      const slotData = slotRaw as Record<string, unknown>;
      if (slotData.available !== true) continue;
      const normalized = buildIsoSlot(dateKey, timeKey, durationMinutes, branchTimezone);
      if (normalized) slots.push(normalized);
    }

    if (slots.length > 0) {
      slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
      result.push({ date: dateKey, slots });
    }
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
