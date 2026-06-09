import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS,
  normalizeOperatorHealthProjectionThresholdsForAdminPatch,
  parseOperatorHealthProjectionThresholds,
} from "./operatorHealthProjectionThresholds";

describe("operatorHealthProjectionThresholds", () => {
  it("defaults debounce to 15 minutes", () => {
    expect(DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS.retriesDebounceMinutes).toBe(15);
    expect(parseOperatorHealthProjectionThresholds(null)).toEqual(
      DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS,
    );
  });

  it("parses stored thresholds", () => {
    const cfg = parseOperatorHealthProjectionThresholds({
      value: {
        retriesDebounceMinutes: 20,
        stalePendingDebounceMinutes: 10,
        oldestPendingStaleMinutes: 45,
      },
    });
    expect(cfg.retriesDebounceMinutes).toBe(20);
    expect(cfg.stalePendingDebounceMinutes).toBe(10);
    expect(cfg.oldestPendingStaleMinutes).toBe(45);
  });

  it("rejects invalid admin patch", () => {
    expect(
      normalizeOperatorHealthProjectionThresholdsForAdminPatch({ retriesDebounceMinutes: "x" }),
    ).toEqual({ ok: false });
  });

  it("accepts valid admin patch", () => {
    const r = normalizeOperatorHealthProjectionThresholdsForAdminPatch({
      retriesDebounceMinutes: 15,
      stalePendingDebounceMinutes: 15,
      oldestPendingStaleMinutes: 30,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.retriesDebounceMinutes).toBe(15);
    }
  });
});
