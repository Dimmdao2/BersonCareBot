export const OPERATOR_HEALTH_PROBE_CONFIG_KEY = "operator_health_probe_config";

export const OPERATOR_HEALTH_PROBE_DEFAULT_VALUE = {
  max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  telegram: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  rubitime: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  google_calendar: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 2 },
  quietUntil: null,
} as const;

const PROBE_NAMES = ["max", "telegram", "rubitime", "google_calendar"] as const;

/** Reject unsafe admin input; callers must never silently clamp probe cadence or timeouts. */
export function assertOperatorHealthProbeConfig(valueJson: unknown): void {
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
    if (typeof p.enabled !== "boolean") throw new Error(`operator_health_probe_config.${name}.enabled must be boolean`);
    if (!Number.isInteger(p.timeoutMs) || p.timeoutMs < 1_000 || p.timeoutMs > 60_000) {
      throw new Error(`operator_health_probe_config.${name}.timeoutMs must be 1000–60000 ms; shorter timeouts cause false failures and provider load`);
    }
    if (!Number.isInteger(p.intervalMs) || p.intervalMs < 300_000 || p.intervalMs > 3_600_000) {
      throw new Error(`operator_health_probe_config.${name}.intervalMs must be 300000–3600000 ms; shorter intervals can DoS the provider`);
    }
    if (!Number.isInteger(p.consecutiveFailures) || p.consecutiveFailures < 2 || p.consecutiveFailures > 10) {
      throw new Error(`operator_health_probe_config.${name}.consecutiveFailures must be 2–10; alerts require confirmed consecutive failures`);
    }
  }
  if (config.quietUntil !== null && (typeof config.quietUntil !== "string" || Number.isNaN(Date.parse(config.quietUntil)))) {
    throw new Error("operator_health_probe_config.quietUntil must be an ISO timestamp or null");
  }
}
