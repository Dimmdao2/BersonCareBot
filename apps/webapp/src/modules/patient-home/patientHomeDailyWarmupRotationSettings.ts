const HH_MM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function unwrapValue(valueJson: unknown): unknown {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

export function normalizeDailyWarmupRotationTime(raw: string): string | null {
  const t = raw.trim();
  const m = HH_MM.exec(t);
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

/** Шаблон при первом включении в admin UI. */
export const DEFAULT_PATIENT_HOME_DAILY_WARMUP_ROTATION_TIMES = ["08:00", "14:00", "20:00"] as const;

export const MAX_DAILY_WARMUP_ROTATION_TIMES = 3;

export function parsePatientHomeDailyWarmupRotationEnabled(valueJson: unknown): boolean {
  const inner = unwrapValue(valueJson);
  if (inner === true || inner === "true") return true;
  if (inner === false || inner === "false") return false;
  return false;
}

export function parsePatientHomeDailyWarmupRotationTimes(valueJson: unknown): string[] {
  const inner = unwrapValue(valueJson);
  if (!Array.isArray(inner)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of inner) {
    if (typeof row !== "string") continue;
    const norm = normalizeDailyWarmupRotationTime(row);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= MAX_DAILY_WARMUP_ROTATION_TIMES) break;
  }
  return out.sort();
}

export function isValidPatientHomeDailyWarmupRotationTimesPayload(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DAILY_WARMUP_ROTATION_TIMES) {
    return false;
  }
  const seen = new Set<string>();
  for (const row of value) {
    if (typeof row !== "string") return false;
    const norm = normalizeDailyWarmupRotationTime(row);
    if (!norm || seen.has(norm)) return false;
    seen.add(norm);
  }
  return true;
}
