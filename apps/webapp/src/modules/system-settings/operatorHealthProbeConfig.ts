export const OPERATOR_HEALTH_PROBE_CONFIG_KEY = "operator_health_probe_config";

export const OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS = 24 * 60 * 60 * 1_000;

export const OPERATOR_HEALTH_PROBE_DEFAULT_VALUE = {
  max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  telegram: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  rubitime: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  google_calendar: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  quietWindowMaxDurationMs: OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS,
  quietUntil: null,
} as const;

const PROBE_NAMES = ["max", "telegram", "rubitime", "google_calendar"] as const;
const QUIET_WINDOW_CAP_MIN_MS = 60_000;
const QUIET_WINDOW_CAP_MAX_MS = 7 * 24 * 60 * 60 * 1_000;

function formatDurationHours(durationMs: number): string {
  const hours = durationMs / (60 * 60 * 1_000);
  return Number.isInteger(hours) ? `${hours} hours` : `${durationMs} ms`;
}

/** Reject unsafe admin input; callers must never silently clamp probe cadence or timeouts. */
export function assertOperatorHealthProbeConfig(valueJson: unknown, now = new Date()): void {
  const value = valueJson && typeof valueJson === "object" && "value" in valueJson
    ? (valueJson as { value: unknown }).value
    : valueJson;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("operator_health_probe_config must be an object");
  }
  const config = value as Record<string, unknown>;
  for (const name of PROBE_NAMES) {
    const probe = config[name];
    if (!probe || typeof probe !== "object" || Array.isArray(probe)) {
      throw new Error(`operator_health_probe_config.${name} is required`);
    }
    const p = probe as Record<string, unknown>;
    if (typeof p.enabled !== "boolean") throw new Error(`Проба ${name}: укажите, включена она или выключена, и сохраните снова.`);
    const timeoutMs = p.timeoutMs;
    if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
      throw new Error(`Таймаут пробы ${name} должен быть от 1 до 60 секунд: меньше создаёт ложные сбои и нагрузку на провайдера. Исправьте таймаут и сохраните снова.`);
    }
    const intervalMs = p.intervalMs;
    if (typeof intervalMs !== "number" || !Number.isInteger(intervalMs) || intervalMs < 300_000 || intervalMs > 3_600_000) {
      throw new Error(`Период пробы ${name} должен быть от 5 до 60 минут: более частые запросы могут перегрузить провайдера. Увеличьте период и сохраните снова.`);
    }
    const consecutiveFailures = p.consecutiveFailures;
    if (typeof consecutiveFailures !== "number" || !Number.isInteger(consecutiveFailures) || consecutiveFailures < 2 || consecutiveFailures > 10) {
      throw new Error(`Порог пробы ${name} должен быть от 2 до 10 подряд: тревога требует подтверждённых сбоев. Исправьте порог и сохраните снова.`);
    }
  }
  const quietWindowMaxDurationMs =
    config.quietWindowMaxDurationMs ?? OPERATOR_HEALTH_PROBE_QUIET_WINDOW_DEFAULT_MAX_DURATION_MS;
  if (
    !Number.isInteger(quietWindowMaxDurationMs) ||
    (quietWindowMaxDurationMs as number) < QUIET_WINDOW_CAP_MIN_MS ||
    (quietWindowMaxDurationMs as number) > QUIET_WINDOW_CAP_MAX_MS
  ) {
    throw new Error(
      `operator_health_probe_config.quietWindowMaxDurationMs must be ${QUIET_WINDOW_CAP_MIN_MS}–${QUIET_WINDOW_CAP_MAX_MS} ms; the maintenance-window cap must remain bounded`,
    );
  }
  if (config.quietUntil !== null && (typeof config.quietUntil !== "string" || Number.isNaN(Date.parse(config.quietUntil)))) {
    throw new Error("Окно тишины должно быть корректной датой или пустым. Исправьте дату и сохраните снова.");
  }
  if (
    typeof config.quietUntil === "string" &&
    Date.parse(config.quietUntil) - now.getTime() > (quietWindowMaxDurationMs as number)
  ) {
    throw new Error(
      `operator_health_probe_config.quietUntil exceeds the configured maintenance-window limit of ${formatDurationHours(quietWindowMaxDurationMs as number)}; longer quiet windows can indefinitely silence mandatory probes`,
    );
  }
}
