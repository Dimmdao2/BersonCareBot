import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaPlaybackStatsHourly } from "../../../db/schema";

const { onConflictDoUpdateMock, valuesMock, insertMock, getDrizzleMock, loggerErrorMock } = vi.hoisted(() => ({
  onConflictDoUpdateMock: vi.fn(() => Promise.resolve(undefined)),
  valuesMock: vi.fn(),
  insertMock: vi.fn(),
  getDrizzleMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackResolutionStat, utcHourBucketIso } from "./playbackStatsHourly";

describe("utcHourBucketIso", () => {
  it("floors to UTC hour", () => {
    const d = new Date("2026-05-03T14:35:22.123Z");
    expect(utcHourBucketIso(d)).toBe("2026-05-03T14:00:00.000Z");
  });
});

describe("recordPlaybackResolutionStat", () => {
  beforeEach(() => {
    onConflictDoUpdateMock.mockClear();
    onConflictDoUpdateMock.mockImplementation(() => Promise.resolve(undefined));
    valuesMock.mockReset();
    valuesMock.mockImplementation(() => ({
      onConflictDoUpdate: onConflictDoUpdateMock,
    }));
    insertMock.mockReset();
    insertMock.mockImplementation(() => ({
      values: valuesMock,
    }));
    getDrizzleMock.mockReset();
    getDrizzleMock.mockImplementation(() => ({
      insert: insertMock,
    }));
    loggerErrorMock.mockReset();
  });

  it("inserts one row with resolved and fallback counts", async () => {
    await recordPlaybackResolutionStat({ delivery: "mp4", fallbackUsed: true });

    expect(getDrizzleMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(mediaPlaybackStatsHourly);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery: "mp4",
        resolvedCount: 1,
        fallbackCount: 1,
        bucketHour: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/),
      }),
    );
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(1);
    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: [mediaPlaybackStatsHourly.bucketHour, mediaPlaybackStatsHourly.delivery],
      }),
    );
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("uses fallbackCount 0 when fallbackUsed is false", async () => {
    await recordPlaybackResolutionStat({ delivery: "hls", fallbackUsed: false });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: "hls", resolvedCount: 1, fallbackCount: 0 }),
    );
  });

  it("runs upsert path on repeated calls (conflict update)", async () => {
    await recordPlaybackResolutionStat({ delivery: "file", fallbackUsed: false });
    await recordPlaybackResolutionStat({ delivery: "file", fallbackUsed: false });
    expect(onConflictDoUpdateMock).toHaveBeenCalledTimes(2);
  });

  it("logs and does not throw when drizzle fails", async () => {
    insertMock.mockImplementationOnce(() => {
      throw new Error("db_down");
    });
    await expect(recordPlaybackResolutionStat({ delivery: "mp4", fallbackUsed: false })).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ delivery: "mp4", err: expect.any(Error) }),
      "playback_stats_hourly_write_failed",
    );
  });
});
