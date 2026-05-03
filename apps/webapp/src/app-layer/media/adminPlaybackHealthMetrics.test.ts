import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock, loggerErrorMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: loggerErrorMock },
}));

import {
  ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
  loadAdminPlaybackHealthMetrics,
} from "./adminPlaybackHealthMetrics";

describe("loadAdminPlaybackHealthMetrics", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it("aggregates byDelivery, totals and unique pairs", async () => {
    const totalsRows = [
      { delivery: "hls", resolvedSum: "7", fallbackSum: "3" },
      { delivery: "mp4", resolvedSum: "2", fallbackSum: "1" },
      { delivery: "file", resolvedSum: "1", fallbackSum: "0" },
    ];
    const uniqueRows = [{ c: "5" }];

    const groupByMock = vi.fn().mockResolvedValue(totalsRows);
    const totalsWhereMock = vi.fn(() => ({ groupBy: groupByMock }));
    const totalsFromMock = vi.fn(() => ({ where: totalsWhereMock }));

    const uniqueWhereMock = vi.fn().mockResolvedValue(uniqueRows);
    const uniqueFromMock = vi.fn(() => ({ where: uniqueWhereMock }));

    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => ({ from: totalsFromMock }))
      .mockImplementationOnce(() => ({ from: uniqueFromMock }));

    getDrizzleMock.mockReturnValue({ select: selectMock });

    const result = await loadAdminPlaybackHealthMetrics({ windowHours: 24 });

    expect(result).toEqual({
      byDelivery: { hls: 7, mp4: 2, file: 1 },
      fallbackTotal: 4,
      totalResolutions: 10,
      uniquePlaybackPairsFirstSeenInWindow: 5,
    });
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("uses default window when invalid windowHours provided", async () => {
    const groupByMock = vi.fn().mockResolvedValue([]);
    const totalsWhereMock = vi.fn(() => ({ groupBy: groupByMock }));
    const totalsFromMock = vi.fn(() => ({ where: totalsWhereMock }));
    const uniqueWhereMock = vi.fn().mockResolvedValue([{ c: "0" }]);
    const uniqueFromMock = vi.fn(() => ({ where: uniqueWhereMock }));
    const selectMock = vi
      .fn()
      .mockImplementationOnce(() => ({ from: totalsFromMock }))
      .mockImplementationOnce(() => ({ from: uniqueFromMock }));
    getDrizzleMock.mockReturnValue({ select: selectMock });

    await expect(loadAdminPlaybackHealthMetrics({ windowHours: -1 })).resolves.toEqual({
      byDelivery: { hls: 0, mp4: 0, file: 0 },
      fallbackTotal: 0,
      totalResolutions: 0,
      uniquePlaybackPairsFirstSeenInWindow: 0,
    });
    expect(ADMIN_PLAYBACK_METRICS_WINDOW_HOURS).toBe(24);
  });

  it("logs and rethrows on drizzle failure", async () => {
    const err = new Error("db_down");
    getDrizzleMock.mockReturnValue({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            throw err;
          }),
        })),
      })),
    });

    await expect(loadAdminPlaybackHealthMetrics({ windowHours: 24 })).rejects.toThrow("db_down");
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      "admin_playback_health_metrics_failed",
    );
  });
});
