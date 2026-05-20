import { describe, expect, it } from "vitest";
import {
  ADMIN_WEB_PUSH_ONLY_REMINDER_TICK_STALE_SEC,
  classifyWebPushOnlyReminderTickSystemHealthStatus,
} from "./adminHealthThresholds";

describe("classifyWebPushOnlyReminderTickSystemHealthStatus", () => {
  const nowMs = Date.parse("2026-05-20T12:00:00.000Z");

  it("returns no_data when no tick row signals", () => {
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        metaJson: {},
        nowMs,
      }),
    ).toBe("no_data");
  });

  it("returns ok for fresh success", () => {
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: "success",
        lastSuccessAt: "2026-05-20T11:58:00.000Z",
        lastFailureAt: null,
        metaJson: { failed: 0 },
        nowMs,
      }),
    ).toBe("ok");
  });

  it("returns degraded when last success is stale", () => {
    const staleIso = new Date(nowMs - (ADMIN_WEB_PUSH_ONLY_REMINDER_TICK_STALE_SEC + 60) * 1000).toISOString();
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: "success",
        lastSuccessAt: staleIso,
        lastFailureAt: null,
        metaJson: {},
        nowMs,
      }),
    ).toBe("degraded");
  });

  it("returns error when last status is failure", () => {
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: "failure",
        lastSuccessAt: "2026-05-20T11:58:00.000Z",
        lastFailureAt: "2026-05-20T12:00:00.000Z",
        metaJson: {},
        nowMs,
      }),
    ).toBe("error");
  });

  it("returns error when failure is newer than success", () => {
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: "success",
        lastSuccessAt: "2026-05-20T11:00:00.000Z",
        lastFailureAt: "2026-05-20T12:00:00.000Z",
        metaJson: {},
        nowMs,
      }),
    ).toBe("error");
  });

  it("returns degraded when last summary has failed > 0", () => {
    expect(
      classifyWebPushOnlyReminderTickSystemHealthStatus({
        lastStatus: "success",
        lastSuccessAt: "2026-05-20T11:59:00.000Z",
        lastFailureAt: null,
        metaJson: { failed: 2 },
        nowMs,
      }),
    ).toBe("degraded");
  });
});
