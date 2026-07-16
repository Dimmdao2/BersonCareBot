import { beforeEach, describe, expect, it, vi } from "vitest";

const { runWebappPgTextMock, loggerErrorMock } = vi.hoisted(() => ({
  runWebappPgTextMock: vi.fn(() => Promise.resolve({ rows: [] })),
  loggerErrorMock: vi.fn(),
}));

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackResolutionEvent } from "./playbackResolutionEvents";

const uid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mid = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("recordPlaybackResolutionEvent", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    loggerErrorMock.mockReset();
    runWebappPgTextMock.mockResolvedValue({ rows: [] });
  });

  it("skips invalid ids", async () => {
    await recordPlaybackResolutionEvent({
      userId: "tg:x",
      mediaId: mid,
      delivery: "mp4",
      fallbackUsed: false,
    });
    expect(runWebappPgTextMock).not.toHaveBeenCalled();
  });

  it("records valid ids through the narrow playback telemetry accessor", async () => {
    await recordPlaybackResolutionEvent({
      userId: uid,
      mediaId: mid,
      delivery: "hls",
      fallbackUsed: true,
    });
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      "SELECT app.record_media_playback_resolution_event($1::uuid, $2::uuid, $3, $4)",
      [uid, mid, "hls", true],
    );
  });

  it("logs and swallows accessor errors", async () => {
    const err = new Error("db_down");
    runWebappPgTextMock.mockRejectedValue(err);
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
