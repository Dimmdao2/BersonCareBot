import { describe, expect, it } from "vitest";
import { DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS } from "./operatorHealthProjectionThresholds";
import {
  advanceProjectionDigestDebounce,
  evaluateProjectionDigestDebounceFlags,
  isProjectionOldestPendingStale,
} from "./projectionDigestDebounce";

const thresholds = DEFAULT_OPERATOR_HEALTH_PROJECTION_THRESHOLDS;
const emptyState = { retriesFirstSeenAt: null, stalePendingFirstSeenAt: null };

describe("projectionDigestDebounce", () => {
  it("does not include retries before debounce elapses", () => {
    const now = Date.parse("2026-06-09T10:00:00.000Z");
    const r = advanceProjectionDigestDebounce(
      {
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 3,
        oldestPendingAt: null,
      },
      thresholds,
      emptyState,
      now,
    );
    expect(r.includeRetriesInDigest).toBe(false);
    expect(r.state.retriesFirstSeenAt).toBe("2026-06-09T10:00:00.000Z");
  });

  it("includes retries after debounce sustained", () => {
    const first = Date.parse("2026-06-09T09:44:00.000Z");
    const now = Date.parse("2026-06-09T10:00:00.000Z");
    const r = advanceProjectionDigestDebounce(
      {
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 2,
        oldestPendingAt: null,
      },
      thresholds,
      { retriesFirstSeenAt: "2026-06-09T09:44:00.000Z", stalePendingFirstSeenAt: null },
      now,
    );
    expect(now - first).toBeGreaterThanOrEqual(15 * 60 * 1000);
    expect(r.includeRetriesInDigest).toBe(true);
  });

  it("resets debounce on critical projection dead", () => {
    const r = advanceProjectionDigestDebounce(
      {
        probeStatus: "ok",
        deadCount: 1,
        retriesOverThreshold: 5,
        oldestPendingAt: "2026-06-09T08:00:00.000Z",
      },
      thresholds,
      {
        retriesFirstSeenAt: "2026-06-09T09:00:00.000Z",
        stalePendingFirstSeenAt: "2026-06-09T09:00:00.000Z",
      },
      Date.parse("2026-06-09T10:00:00.000Z"),
    );
    expect(r.includeRetriesInDigest).toBe(false);
    expect(r.includeStalePendingInDigest).toBe(false);
    expect(r.state).toEqual(emptyState);
  });

  it("evaluate reads flags from persisted state without advancing", () => {
    const now = Date.parse("2026-06-09T10:00:00.000Z");
    const flags = evaluateProjectionDigestDebounceFlags(
      {
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 3,
        oldestPendingAt: null,
      },
      thresholds,
      { retriesFirstSeenAt: "2026-06-09T09:44:00.000Z", stalePendingFirstSeenAt: null },
      now,
    );
    expect(flags.includeRetriesInDigest).toBe(true);
    expect(flags.includeStalePendingInDigest).toBe(false);
  });

  it("includes stale pending after debounce", () => {
    const oldest = "2026-06-09T08:00:00.000Z";
    const now = Date.parse("2026-06-09T10:00:00.000Z");
    expect(isProjectionOldestPendingStale(oldest, thresholds.oldestPendingStaleMinutes, now)).toBe(true);
    const r = advanceProjectionDigestDebounce(
      {
        probeStatus: "ok",
        deadCount: 0,
        retriesOverThreshold: 0,
        oldestPendingAt: oldest,
      },
      thresholds,
      { retriesFirstSeenAt: null, stalePendingFirstSeenAt: "2026-06-09T09:44:00.000Z" },
      now,
    );
    expect(r.includeStalePendingInDigest).toBe(true);
  });
});
