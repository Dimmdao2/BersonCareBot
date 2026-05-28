/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { envHolder, runRetentionMock, loggerInfoMock, recordTickMock } = vi.hoisted(() => ({
  envHolder: { INTERNAL_JOB_SECRET: "test-internal-secret" as string },
  runRetentionMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  recordTickMock: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: envHolder,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    productAnalytics: {
      runRetention: (...args: unknown[]) => runRetentionMock(...args),
    },
  }),
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { info: loggerInfoMock, warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/app-layer/operator-health/recordOperatorCronJobTick", () => ({
  recordOperatorCronJobTickBestEffort: (...args: unknown[]) => recordTickMock(...args),
}));

import { POST } from "./route";

const sampleResult = {
  dryRun: false,
  recentDays: 90,
  userHourlyDays: 180,
  hourlyDays: 730,
  pushDays: 730,
  deletedRecent: 1,
  deletedUserHourly: 2,
  deletedHourly: 3,
  deletedPushNotifications: 4,
};

describe("POST /api/internal/product-analytics/retention", () => {
  beforeEach(() => {
    envHolder.INTERNAL_JOB_SECRET = "test-internal-secret";
    runRetentionMock.mockReset();
    loggerInfoMock.mockReset();
    recordTickMock.mockReset();
    runRetentionMock.mockResolvedValue(sampleResult);
    recordTickMock.mockResolvedValue(undefined);
  });

  it("returns 503 when INTERNAL_JOB_SECRET is not configured", async () => {
    envHolder.INTERNAL_JOB_SECRET = "";
    const res = await POST(
      new Request("http://localhost/api/internal/product-analytics/retention", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(503);
    expect(runRetentionMock).not.toHaveBeenCalled();
  });

  it("returns 401 without bearer token", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/product-analytics/retention", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
    expect(runRetentionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid recentDays", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/product-analytics/retention?recentDays=0", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(400);
    expect(runRetentionMock).not.toHaveBeenCalled();
  });

  it("uses default retention windows when query is absent", async () => {
    const res = await POST(
      new Request("http://localhost/api/internal/product-analytics/retention", {
        method: "POST",
        headers: { authorization: "Bearer test-internal-secret" },
      }),
    );
    expect(res.status).toBe(200);
    expect(runRetentionMock).toHaveBeenCalledWith({
      dryRun: false,
      recentDays: 90,
      userHourlyDays: 180,
      hourlyDays: 730,
      pushDays: 730,
    });
    expect(recordTickMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        jobKey: "analytics.product_analytics.retention",
      }),
    );
  });

  it("runs dryRun with custom day windows", async () => {
    runRetentionMock.mockResolvedValueOnce({ ...sampleResult, dryRun: true, recentDays: 30 });
    const res = await POST(
      new Request(
        "http://localhost/api/internal/product-analytics/retention?dryRun=1&recentDays=30&userHourlyDays=60",
        {
          method: "POST",
          headers: { authorization: "Bearer test-internal-secret" },
        },
      ),
    );
    expect(res.status).toBe(200);
    expect(runRetentionMock).toHaveBeenCalledWith({
      dryRun: true,
      recentDays: 30,
      userHourlyDays: 60,
      hourlyDays: 730,
      pushDays: 730,
    });
    const json = (await res.json()) as typeof sampleResult & { ok: boolean };
    expect(json.ok).toBe(true);
    expect(json.dryRun).toBe(true);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true, recentDays: 30 }),
      "product_analytics_retention_job",
    );
  });
});
