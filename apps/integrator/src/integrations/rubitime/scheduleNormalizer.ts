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
 * Если data не совпадает с ожидаемым shape — бросаем ошибку, чтобы caller мог
 * вернуть 502, а не silent empty.
 */

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
): NormalizedSlot | null {
  // timeStr format: "HH:MM" (Rubitime docs)
  if (!/^\d{1,2}:\d{2}$/.test(timeStr)) return null;
  const [hourStr, minuteStr] = timeStr.split(':');
  if (!hourStr || !minuteStr) return null;
  const h = parseInt(hourStr, 10);
  const m = parseInt(minuteStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  // Rubitime schedule has no timezone. Keep wall-clock time semantics:
  // use UTC math to avoid server local timezone shifts.
  const year = Number.parseInt(dateStr.slice(0, 4), 10);
  const month = Number.parseInt(dateStr.slice(5, 7), 10);
  const day = Number.parseInt(dateStr.slice(8, 10), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const startMsUtc = Date.UTC(year, month - 1, day, h, m, 0, 0);
  if (!Number.isFinite(startMsUtc)) return null;
  const endMsUtc = startMsUtc + durationMinutes * 60 * 1000;
  const startAt = new Date(startMsUtc).toISOString().slice(0, 19);
  const endAt = new Date(endMsUtc).toISOString().slice(0, 19);
  return { startAt, endAt };
}

/**
 * @throws Error с кодом RUBITIME_SCHEDULE_MALFORMED_DATA если data не подходит по shape.
 */
export function normalizeRubitimeSchedule(
  data: unknown,
  durationMinutes: number,
  dateFilter?: string,
): NormalizedSlotsByDate[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error(`RUBITIME_SCHEDULE_MALFORMED_DATA: expected object, got ${Array.isArray(data) ? 'array' : typeof data}`);
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
      const normalized = buildIsoSlot(dateKey, timeKey, durationMinutes);
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
