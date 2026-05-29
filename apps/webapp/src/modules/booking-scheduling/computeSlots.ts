import { intervalsOverlap } from "@/modules/patient-booking/slotOverlap";

export type TimeInterval = { startMs: number; endMs: number };

export type WorkingHoursRow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
};

export type BusyInterval = { startAt: string; endAt: string };

const DEFAULT_WORKING: WorkingHoursRow[] = [
  { weekday: 1, startMinute: 9 * 60, endMinute: 18 * 60 },
  { weekday: 2, startMinute: 9 * 60, endMinute: 18 * 60 },
  { weekday: 3, startMinute: 9 * 60, endMinute: 18 * 60 },
  { weekday: 4, startMinute: 9 * 60, endMinute: 18 * 60 },
  { weekday: 5, startMinute: 9 * 60, endMinute: 18 * 60 },
];

export function pickWorkingHours(rows: WorkingHoursRow[]): WorkingHoursRow[] {
  return rows.length > 0 ? rows : DEFAULT_WORKING;
}

/** Local calendar date YYYY-MM-DD in IANA timezone. */
export function localDateKey(isoUtc: string, timeZone: string): string {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

export function localWeekday(dateKey: string, timeZone: string): number {
  const noonUtc = wallClockToUtcIso(dateKey, 12, 0, timeZone);
  const d = new Date(noonUtc);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(d);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? new Date(noonUtc).getUTCDay();
}

export function wallClockToUtcIso(dateKey: string, hour: number, minute: number, timeZone: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, 0));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  for (let offsetMin = -14 * 60; offsetMin <= 14 * 60; offsetMin += 15) {
    const candidate = new Date(guess.getTime() + offsetMin * 60_000);
    const parts = formatter.formatToParts(candidate);
    const py = Number(parts.find((p) => p.type === "year")?.value);
    const pm = Number(parts.find((p) => p.type === "month")?.value);
    const pd = Number(parts.find((p) => p.type === "day")?.value);
    const ph = Number(parts.find((p) => p.type === "hour")?.value);
    const pmin = Number(parts.find((p) => p.type === "minute")?.value);
    if (py === y && pm === m && pd === d && ph === hour && pmin === minute) {
      return candidate.toISOString();
    }
  }
  return guess.toISOString();
}

export function workingIntervalsForDate(
  dateKey: string,
  timeZone: string,
  working: WorkingHoursRow[],
  bufferMinutes: number,
): TimeInterval[] {
  const wd = localWeekday(dateKey, timeZone);
  const rows = working.filter((w) => w.weekday === wd);
  const out: TimeInterval[] = [];
  for (const row of rows) {
    const startIso = wallClockToUtcIso(dateKey, Math.floor(row.startMinute / 60), row.startMinute % 60, timeZone);
    const endIso = wallClockToUtcIso(dateKey, Math.floor(row.endMinute / 60), row.endMinute % 60, timeZone);
    const startMs = new Date(startIso).getTime() + bufferMinutes * 60_000;
    const endMs = new Date(endIso).getTime() - bufferMinutes * 60_000;
    if (endMs > startMs) out.push({ startMs, endMs });
  }
  return out;
}

export function subtractBusy(working: TimeInterval[], busy: TimeInterval[]): TimeInterval[] {
  let free = [...working];
  for (const b of busy) {
    const next: TimeInterval[] = [];
    for (const w of free) {
      if (b.endMs <= w.startMs || b.startMs >= w.endMs) {
        next.push(w);
        continue;
      }
      if (b.startMs > w.startMs) next.push({ startMs: w.startMs, endMs: Math.min(b.startMs, w.endMs) });
      if (b.endMs < w.endMs) next.push({ startMs: Math.max(b.endMs, w.startMs), endMs: w.endMs });
    }
    free = next.filter((x) => x.endMs > x.startMs);
  }
  return free;
}

export function generateSlotsFromFree(
  free: TimeInterval[],
  durationMinutes: number,
  stepMinutes: number,
): { startAt: string; endAt: string }[] {
  const durMs = durationMinutes * 60_000;
  const stepMs = stepMinutes * 60_000;
  const slots: { startAt: string; endAt: string }[] = [];
  for (const interval of free) {
    for (let t = interval.startMs; t + durMs <= interval.endMs; t += stepMs) {
      slots.push({
        startAt: new Date(t).toISOString(),
        endAt: new Date(t + durMs).toISOString(),
      });
    }
  }
  return slots;
}

export function busyFromRecords(busy: BusyInterval[]): TimeInterval[] {
  return busy
    .map((b) => ({
      startMs: new Date(b.startAt).getTime(),
      endMs: new Date(b.endAt).getTime(),
    }))
    .filter((x) => Number.isFinite(x.startMs) && Number.isFinite(x.endMs) && x.endMs > x.startMs);
}

export function isChainFree(
  slotStart: string,
  slotCount: number,
  durationMinutes: number,
  busy: BusyInterval[],
): boolean {
  const startMs = new Date(slotStart).getTime();
  const endMs = startMs + slotCount * durationMinutes * 60_000;
  const chainStart = new Date(startMs).toISOString();
  const chainEnd = new Date(endMs).toISOString();
  for (const b of busy) {
    if (intervalsOverlap(chainStart, chainEnd, b.startAt, b.endAt)) return false;
  }
  return true;
}

export function groupSlotsByLocalDate(
  slots: { startAt: string; endAt: string }[],
  timeZone: string,
): { date: string; slots: { startAt: string; endAt: string }[] }[] {
  const map = new Map<string, { startAt: string; endAt: string }[]>();
  for (const s of slots) {
    const key = localDateKey(s.startAt, timeZone);
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, daySlots]) => ({ date, slots: daySlots }));
}
