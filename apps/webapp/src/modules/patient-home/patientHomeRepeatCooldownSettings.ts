/** Минимальная/максимальная пауза (минуты) для PATCH и UI; синхронно с `route.ts` admin settings. */
export const PATIENT_REPEAT_COOLDOWN_MINUTES_MIN = 5;
export const PATIENT_REPEAT_COOLDOWN_MINUTES_MAX = 180;

export const DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES = 60;
export const DEFAULT_PATIENT_TREATMENT_PLAN_ITEM_DONE_REPEAT_COOLDOWN_MINUTES = 60;
export const DEFAULT_PATIENT_HOME_WARMUP_SKIP_TO_NEXT_AVAILABLE_ENABLED = true;

function unwrapValue(valueJson: unknown): unknown {
  if (valueJson !== null && typeof valueJson === "object" && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as { value: unknown }).value;
  }
  return valueJson;
}

function parsePositiveIntMinutes(inner: unknown): number | null {
  const n =
    typeof inner === "number" && Number.isFinite(inner)
      ? Math.round(inner)
      : typeof inner === "string" && /^\d+$/.test(inner.trim())
        ? Number.parseInt(inner.trim(), 10)
        : NaN;
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function clampRepeatCooldownMinutes(n: number): number {
  return Math.min(
    PATIENT_REPEAT_COOLDOWN_MINUTES_MAX,
    Math.max(PATIENT_REPEAT_COOLDOWN_MINUTES_MIN, Math.round(n)),
  );
}

/** Без строки в БД или при мусоре — дефолт 60 (как прежняя константа). */
export function parsePatientHomeDailyWarmupRepeatCooldownMinutes(valueJson: unknown): number {
  const inner = unwrapValue(valueJson);
  const n = parsePositiveIntMinutes(inner);
  if (n === null) return DEFAULT_PATIENT_HOME_DAILY_WARMUP_REPEAT_COOLDOWN_MINUTES;
  return clampRepeatCooldownMinutes(n);
}

export function parsePatientTreatmentPlanItemDoneRepeatCooldownMinutes(valueJson: unknown): number {
  const inner = unwrapValue(valueJson);
  const n = parsePositiveIntMinutes(inner);
  if (n === null) return DEFAULT_PATIENT_TREATMENT_PLAN_ITEM_DONE_REPEAT_COOLDOWN_MINUTES;
  return clampRepeatCooldownMinutes(n);
}

export function parsePatientHomeWarmupSkipToNextAvailableEnabled(valueJson: unknown): boolean {
  const inner = unwrapValue(valueJson);
  if (inner === true || inner === "true") return true;
  if (inner === false || inner === "false") return false;
  return DEFAULT_PATIENT_HOME_WARMUP_SKIP_TO_NEXT_AVAILABLE_ENABLED;
}
