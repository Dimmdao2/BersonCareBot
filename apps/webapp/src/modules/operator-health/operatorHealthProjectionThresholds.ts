export const OPERATOR_HEALTH_PROJECTION_THRESHOLDS_KEY = "operator_health_projection_thresholds" as const;

export type OperatorHealthProjectionThresholds = {
  /** Минуты устойчивого retries-only перед строкой в сводке. */
  retriesDebounceMinutes: number;
  /** Минуты устойчивого stale pending перед строкой в сводке. */
  stalePendingDebounceMinutes: number;
  /** Возраст oldest pending (мин) — порог «stale pending». */
  oldestPendingStaleMinutes: number;
};

export const DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS: OperatorHealthProjectionThresholds = {
  retriesDebounceMinutes: 15,
  stalePendingDebounceMinutes: 15,
  oldestPendingStaleMinutes: 30,
};

const MIN_DEBOUNCE_MIN = 1;
const MAX_DEBOUNCE_MIN = 24 * 60;
const MIN_STALE_MIN = 5;
const MAX_STALE_MIN = 7 * 24 * 60;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function unwrapValueJson(valueJson: unknown): unknown {
  if (valueJson === null || valueJson === undefined) return null;
  if (typeof valueJson === "object" && valueJson !== null && "value" in (valueJson as Record<string, unknown>)) {
    return (valueJson as Record<string, unknown>).value;
  }
  return valueJson;
}

export function parseOperatorHealthProjectionThresholds(
  valueJson: unknown,
): OperatorHealthProjectionThresholds {
  const defaults = DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS;
  const root = unwrapValueJson(valueJson);
  if (root === null || typeof root !== "object" || Array.isArray(root)) return defaults;
  const o = root as Record<string, unknown>;
  return {
    retriesDebounceMinutes:
      typeof o.retriesDebounceMinutes === "number"
        ? clampInt(o.retriesDebounceMinutes, MIN_DEBOUNCE_MIN, MAX_DEBOUNCE_MIN)
        : defaults.retriesDebounceMinutes,
    stalePendingDebounceMinutes:
      typeof o.stalePendingDebounceMinutes === "number"
        ? clampInt(o.stalePendingDebounceMinutes, MIN_DEBOUNCE_MIN, MAX_DEBOUNCE_MIN)
        : defaults.stalePendingDebounceMinutes,
    oldestPendingStaleMinutes:
      typeof o.oldestPendingStaleMinutes === "number"
        ? clampInt(o.oldestPendingStaleMinutes, MIN_STALE_MIN, MAX_STALE_MIN)
        : defaults.oldestPendingStaleMinutes,
  };
}

export async function loadOperatorHealthProjectionThresholds(
  getConfigValue: (key: string, fallback: string) => Promise<string>,
): Promise<OperatorHealthProjectionThresholds> {
  const raw = await getConfigValue(OPERATOR_HEALTH_PROJECTION_THRESHOLDS_KEY, "");
  if (!raw.trim()) return DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS;
  try {
    return parseOperatorHealthProjectionThresholds(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS;
  }
}

export function normalizeOperatorHealthProjectionThresholdsForAdminPatch(
  inner: unknown,
): { ok: true; value: OperatorHealthProjectionThresholds } | { ok: false } {
  if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
    return { ok: false };
  }
  const o = inner as Record<string, unknown>;
  const defaults = DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS;
  const readMin = (key: keyof OperatorHealthProjectionThresholds, min: number, max: number): number | null => {
    if (!(key in o)) return defaults[key];
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    return clampInt(v, min, max);
  };
  const retriesDebounceMinutes = readMin("retriesDebounceMinutes", MIN_DEBOUNCE_MIN, MAX_DEBOUNCE_MIN);
  const stalePendingDebounceMinutes = readMin(
    "stalePendingDebounceMinutes",
    MIN_DEBOUNCE_MIN,
    MAX_DEBOUNCE_MIN,
  );
  const oldestPendingStaleMinutes = readMin("oldestPendingStaleMinutes", MIN_STALE_MIN, MAX_STALE_MIN);
  if (
    retriesDebounceMinutes === null ||
    stalePendingDebounceMinutes === null ||
    oldestPendingStaleMinutes === null
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    value: { retriesDebounceMinutes, stalePendingDebounceMinutes, oldestPendingStaleMinutes },
  };
}
