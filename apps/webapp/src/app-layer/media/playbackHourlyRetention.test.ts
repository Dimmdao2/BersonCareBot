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
  PLAYBACK_HOURLY_STATS_RETENTION_DAYS,
  purgeStalePlaybackHourlyStats,
} from "./playbackHourlyRetention";

describe("purgeStalePlaybackHourlyStats", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    loggerErrorMock.mockReset();
  });

  it("returns dry-run count when dryRun is true", async () => {
    const whereMock = vi.fn().mockResolvedValue([{ c: "12" }]);
    const fromMock = vi.fn(() => ({ where: whereMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDrizzleMock.mockReturnValue({ select: selectMock });

    await expect(purgeStalePlaybackHourlyStats({ dryRun: true, retentionDays: 30 })).resolves.toEqual({
      deleted: 12,
      retentionDays: 30,
      dryRun: true,
    });
  });

  it("deletes stale rows and returns removed length", async () => {
    const returningMock = vi
      .fn()
      .mockResolvedValue([{ bucketHour: "2026-01-01T00:00:00.000Z" }, { bucketHour: "2026-01-02T00:00:00.000Z" }]);
    const whereMock = vi.fn(() => ({ returning: returningMock }));
    const deleteMock = vi.fn(() => ({ where: whereMock }));
    getDrizzleMock.mockReturnValue({ delete: deleteMock });

    await expect(purgeStalePlaybackHourlyStats({ retentionDays: 7 })).resolves.toEqual({
      deleted: 2,
      retentionDays: 7,
      dryRun: false,
    });
  });

  it("uses default retention days when not provided", async () => {
    const whereMock = vi.fn().mockResolvedValue([{ c: "0" }]);
    const fromMock = vi.fn(() => ({ where: whereMock }));
    const selectMock = vi.fn(() => ({ from: fromMock }));
    getDrizzleMock.mockReturnValue({ select: selectMock });

    const result = await purgeStalePlaybackHourlyStats({ dryRun: true });
    expect(result.retentionDays).toBe(PLAYBACK_HOURLY_STATS_RETENTION_DAYS);
    expect(result.dryRun).toBe(true);
  });

  it("logs and returns zeroed result when db fails and throwErrors is false", async () => {
    getDrizzleMock.mockImplementation(() => {
      throw new Error("db_down");
    });

    await expect(
      purgeStalePlaybackHourlyStats({ dryRun: false, retentionDays: 10, throwErrors: false }),
    ).resolves.toEqual({
      deleted: 0,
      retentionDays: 10,
      dryRun: false,
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ days: 10, err: expect.any(Error) }),
      "playback_hourly_stats_purge_failed",
    );
  });

  it("rethrows when throwErrors is true", async () => {
    getDrizzleMock.mockImplementation(() => {
      throw new Error("db_down");
    });

    await expect(
      purgeStalePlaybackHourlyStats({ dryRun: true, retentionDays: 5, throwErrors: true }),
    ).rejects.toThrow("db_down");
  });
});
