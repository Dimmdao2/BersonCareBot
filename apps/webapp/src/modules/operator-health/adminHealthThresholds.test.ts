import { describe, expect, it } from "vitest";
import {
  ADMIN_TRANSCODE_FAILED_LAST_HOUR_ERROR,
  classifyVideoTranscodeSystemHealthStatus,
} from "./adminHealthThresholds";

describe("classifyVideoTranscodeSystemHealthStatus", () => {
  const base = {
    pipelineEnabled: true,
    reconcileEnabled: false,
    pendingCount: 1,
    oldestPendingAgeSeconds: 0,
    failedLastHour: 0,
    failedLast24h: 0,
    reconcileLastStatus: null as string | null,
  };

  it("returns ok when pipeline off regardless of counters", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pipelineEnabled: false,
        pendingCount: 99,
        oldestPendingAgeSeconds: 99_999,
        failedLastHour: ADMIN_TRANSCODE_FAILED_LAST_HOUR_ERROR,
        failedLast24h: 100,
      }),
    ).toBe("ok");
  });

  it("degrades on oldest pending ≥ 15 min with backlog", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        oldestPendingAgeSeconds: 15 * 60,
      }),
    ).toBe("degraded");
  });

  it("errors on oldest pending ≥ 60 min with backlog", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        oldestPendingAgeSeconds: 60 * 60,
      }),
    ).toBe("error");
  });

  it("ignores age when queue empty", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pendingCount: 0,
        oldestPendingAgeSeconds: 60 * 60,
        failedLastHour: 0,
        failedLast24h: 0,
      }),
    ).toBe("ok");
  });

  it("degrades on failed last hour ≥ 3", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pendingCount: 0,
        failedLastHour: 3,
      }),
    ).toBe("degraded");
  });

  it("errors on failed last hour ≥ 10", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pendingCount: 0,
        failedLastHour: 10,
      }),
    ).toBe("error");
  });

  it("degrades on ≥5 failures in 24h", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pendingCount: 0,
        failedLast24h: 5,
      }),
    ).toBe("degraded");
  });

  it("degrades when reconcile tick lastStatus is failure", () => {
    expect(
      classifyVideoTranscodeSystemHealthStatus({
        ...base,
        pipelineEnabled: false,
        reconcileEnabled: true,
        pendingCount: 0,
        reconcileLastStatus: "failure",
      }),
    ).toBe("degraded");
  });
});
