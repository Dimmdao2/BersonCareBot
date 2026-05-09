/** Shared HH:MM ↔ minute-of-day helpers for reminder UIs (0–1440 end-exclusive style for window end). */

export function minutesToTimeInput(m: number): string {
  const capped = Math.min(Math.max(0, m), 1440);
  const h = Math.floor(capped / 60)
    .toString()
    .padStart(2, "0");
  const min = (capped % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}

export function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59) {
    return null;
  }
  if (h === 24) {
    return min === 0 ? 1440 : null;
  }
  if (h < 0 || h > 23) return null;
  const mod = h * 60 + min;
  return mod;
}

/** Parse "HH:MM" to quiet start minute 0–1439; null if empty/disabled. */
export function parseQuietStartMinute(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const mod = timeInputToMinutes(t);
  if (mod === null || mod > 1439) return null;
  return mod;
}

/** Parse "HH:MM" to quiet end minute 1–1440 (exclusive upper bound style). */
export function parseQuietEndMinute(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const mod = timeInputToMinutes(t);
  if (mod === null || mod < 1) return null;
  return Math.min(mod, 1440);
}
