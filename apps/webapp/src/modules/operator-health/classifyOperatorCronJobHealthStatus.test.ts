import { describe, expect, it } from "vitest";
import { classifyOperatorCronJobHealthStatus } from "@/modules/operator-health/classifyOperatorCronJobHealthStatus";

describe("classifyOperatorCronJobHealthStatus", () => {
  const nowMs = Date.parse("2026-05-28T12:00:00.000Z");

  it("returns no_data when no ticks", () => {
    expect(
      classifyOperatorCronJobHealthStatus({
        lastStatus: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        staleAfterSec: 300,
        nowMs,
      }),
    ).toBe("no_data");
  });

  it("returns ok for fresh success", () => {
    expect(
      classifyOperatorCronJobHealthStatus({
        lastStatus: "success",
        lastSuccessAt: "2026-05-28T11:58:00.000Z",
        lastFailureAt: null,
        staleAfterSec: 300,
        nowMs,
      }),
    ).toBe("ok");
  });

  it("returns degraded when success is stale", () => {
    expect(
      classifyOperatorCronJobHealthStatus({
        lastStatus: "success",
        lastSuccessAt: "2026-05-20T12:00:00.000Z",
        lastFailureAt: null,
        staleAfterSec: 300,
        nowMs,
      }),
    ).toBe("degraded");
  });

  it("returns error when last status is failure newer than success", () => {
    expect(
      classifyOperatorCronJobHealthStatus({
        lastStatus: "failure",
        lastSuccessAt: "2026-05-28T11:00:00.000Z",
        lastFailureAt: "2026-05-28T11:59:00.000Z",
        staleAfterSec: 300,
        nowMs,
      }),
    ).toBe("error");
  });
});
