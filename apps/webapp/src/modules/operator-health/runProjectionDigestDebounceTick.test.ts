import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS } from "./operatorHealthProjectionThresholds";
import { runProjectionDigestDebounceTick } from "./runProjectionDigestDebounceTick";

describe("runProjectionDigestDebounceTick", () => {
  it("persists debounce state and returns flags", async () => {
    const getOperatorJobStatus = vi.fn().mockResolvedValue({
      metaJson: { retriesFirstSeenAt: "2026-06-09T09:44:00.000Z", stalePendingFirstSeenAt: null },
    });
    const recordOperatorJobTickSuccess = vi.fn().mockResolvedValue(undefined);
    const now = Date.parse("2026-06-09T10:00:00.000Z");

    const flags = await runProjectionDigestDebounceTick({
      operatorHealthRead: { getOperatorJobStatus } as never,
      operatorHealthWrite: { recordOperatorJobTickSuccess } as never,
      getConfigValue: vi.fn().mockResolvedValue(""),
      fetchSignal: vi.fn().mockResolvedValue({
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 2,
        oldestPendingAt: null,
      }),
      nowMs: now,
    });

    expect(flags.includeRetriesLine).toBe(true);
    expect(recordOperatorJobTickSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        jobKey: "health.projection_digest.debounce",
        metaJson: expect.objectContaining({ retriesFirstSeenAt: "2026-06-09T09:44:00.000Z" }),
      }),
    );
  });

  it("uses defaults when config is empty", async () => {
    const recordOperatorJobTickSuccess = vi.fn().mockResolvedValue(undefined);
    await runProjectionDigestDebounceTick({
      operatorHealthRead: { getOperatorJobStatus: vi.fn().mockResolvedValue(null) } as never,
      operatorHealthWrite: { recordOperatorJobTickSuccess } as never,
      getConfigValue: vi.fn().mockResolvedValue(""),
      fetchSignal: vi.fn().mockResolvedValue({
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 0,
        oldestPendingAt: null,
      }),
      nowMs: Date.now(),
    });
    expect(recordOperatorJobTickSuccess).toHaveBeenCalled();
    expect(DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS.retriesDebounceMinutes).toBe(15);
  });
});
