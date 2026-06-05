import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDrizzleMock, insertMock, valuesMock, loggerErrorMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
  insertMock: vi.fn(),
  valuesMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackResolutionEvent } from "./playbackResolutionEvents";

const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("recordPlaybackResolutionEvent", () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    insertMock.mockReset();
    valuesMock.mockReset();
    loggerErrorMock.mockReset();
    valuesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: valuesMock });
    getDrizzleMock.mockReturnValue({ insert: insertMock });
  });

  it("skips invalid ids", async () => {
    await recordPlaybackResolutionEvent({
      userId: "tg:x",
      mediaId: mid,
      delivery: "mp4",
      fallbackUsed: false,
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("inserts event for valid ids", async () => {
    await recordPlaybackResolutionEvent({
      userId: uid,
      mediaId: mid,
      delivery: "hls",
      fallbackUsed: true,
    });
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: uid,
        mediaId: mid,
        delivery: "hls",
        fallbackUsed: true,
      }),
    );
  });

  it("logs and swallows insert errors", async () => {
    const err = new Error("db_down");
    valuesMock.mockRejectedValue(err);
    await expect(
      recordPlaybackResolutionEvent({
        userId: uid,
        mediaId: mid,
        delivery: "file",
        fallbackUsed: false,
      }),
    ).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ err, mediaId: mid }),
      "playback_resolution_event_write_failed",
    );
  });
});
