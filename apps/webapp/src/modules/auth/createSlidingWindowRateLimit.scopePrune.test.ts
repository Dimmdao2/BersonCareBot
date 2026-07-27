import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRateLimitCheckParams } from "@/modules/auth/authRateLimitPort";

const { dbMock, loggerWarnMock } = vi.hoisted(() => ({
  dbMock: vi.fn<(params: AuthRateLimitCheckParams) => Promise<boolean>>(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://synthetic.test/db" },
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: { warn: loggerWarnMock },
}));

import { createSlidingWindowRateLimit } from "@/modules/auth/createSlidingWindowRateLimit";

describe("sliding-window scope prune cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    dbMock.mockReset();
    loggerWarnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows one in-process prune per interval while preserving each DB limit result", async () => {
    const firstControl: { resolve?: (value: boolean) => void } = {};
    dbMock
      .mockImplementationOnce(() => new Promise<boolean>((resolve) => {
        firstControl.resolve = resolve;
      }))
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);

    const isLimited = createSlidingWindowRateLimit({
      scope: "patient.client_boot_report",
      windowMs: 3_600_000,
      maxPerWindow: 30,
      scopePrune: {
        retentionMs: 3_600_000,
        intervalMs: 300_000,
        batchSize: 500,
      },
      db: { checkAndRecord: (params) => dbMock(params) },
    });

    const first = isLimited("client-boot:v1:first");
    expect(dbMock).toHaveBeenCalledTimes(1);
    expect(dbMock.mock.calls[0]?.[0].scopePrune).toEqual({
      retentionMs: 3_600_000,
      batchSize: 500,
    });

    await expect(isLimited("client-boot:v1:concurrent")).resolves.toBe(true);
    expect(dbMock.mock.calls[1]?.[0].scopePrune).toBeUndefined();
    firstControl.resolve?.(false);
    await expect(first).resolves.toBe(false);

    vi.advanceTimersByTime(299_999);
    await expect(isLimited("client-boot:v1:before-interval")).resolves.toBe(false);
    expect(dbMock.mock.calls[2]?.[0].scopePrune).toBeUndefined();

    vi.advanceTimersByTime(1);
    await expect(isLimited("client-boot:v1:next-interval")).resolves.toBe(false);
    expect(dbMock.mock.calls[3]?.[0].scopePrune).toEqual({
      retentionMs: 3_600_000,
      batchSize: 500,
    });
  });

  it("logs the permanent memory fallback once and does not retry the latched DB leg", async () => {
    dbMock.mockRejectedValue(new Error("synthetic database failure"));
    const isLimited = createSlidingWindowRateLimit({
      scope: "auth.confirm",
      windowMs: 600_000,
      maxPerWindow: 1,
      db: { checkAndRecord: (params) => dbMock(params) },
    });

    await expect(isLimited("198.51.100.7")).resolves.toBe(false);
    await expect(isLimited("198.51.100.7")).resolves.toBe(true);

    expect(dbMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock.mock.calls[0]?.[0]).toMatchObject({
      scope: "auth.confirm",
      event: "auth_rate_limit_db_fallback",
    });
  });
});
