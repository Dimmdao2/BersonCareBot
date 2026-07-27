import { describe, expect, it } from "vitest";
import { assertOperatorHealthProbeConfig, OPERATOR_HEALTH_PROBE_DEFAULT_VALUE } from "./operatorHealthProbeConfig";
import { SYSTEM_SETTING_REGISTRY } from "./registry";

describe("operator health probe settings", () => {
  it("keeps the registry default in code and accepts it", () => {
    expect(SYSTEM_SETTING_REGISTRY.operator_health_probe_config.defaultValue).toBe(JSON.stringify(OPERATOR_HEALTH_PROBE_DEFAULT_VALUE));
    expect(() => assertOperatorHealthProbeConfig({ value: OPERATOR_HEALTH_PROBE_DEFAULT_VALUE })).not.toThrow();
  });

  it("rejects unsafe timeout and interval with an explanation", () => {
    const tooFast = structuredClone(OPERATOR_HEALTH_PROBE_DEFAULT_VALUE) as {
      max: { enabled: boolean; intervalMs: number; timeoutMs: number; consecutiveFailures: number };
      telegram: { enabled: boolean; intervalMs: number; timeoutMs: number; consecutiveFailures: number };
      google_calendar: { enabled: boolean; intervalMs: number; timeoutMs: number; consecutiveFailures: number };
      email: { intervalMs: number; timeoutMs: number; roundTripDeadlineMs: number; retentionMs: number; cleanupIntervalMs: number };
      quietWindowMaxDurationMs: number;
      quietUntil: string | null;
    };
    tooFast.max.timeoutMs = 999;
    expect(() => assertOperatorHealthProbeConfig({ value: tooFast })).toThrow("от 1 до 60 секунд");
    tooFast.max.timeoutMs = 5_000;
    tooFast.max.intervalMs = 5_000;
    expect(() => assertOperatorHealthProbeConfig({ value: tooFast })).toThrow("могут перегрузить провайдера");
  });

  it("rejects a quiet window longer than the configured 24-hour maintenance cap", () => {
    const config = structuredClone(OPERATOR_HEALTH_PROBE_DEFAULT_VALUE) as {
      quietWindowMaxDurationMs: number;
      quietUntil: string | null;
    } & Record<string, unknown>;
    const now = new Date("2026-07-27T12:00:00.000Z");
    config.quietUntil = "9999-12-31T23:59:59.000Z";

    expect(() => assertOperatorHealthProbeConfig({ value: config }, now)).toThrow(
      "exceeds the configured maintenance-window limit of 24 hours",
    );

    config.quietUntil = "2026-07-28T12:00:00.000Z";
    expect(() => assertOperatorHealthProbeConfig({ value: config }, now)).not.toThrow();
  });
});
