import { beforeEach, describe, expect, it, vi } from "vitest";
import { mediaPlaybackUserVideoFirstResolve as mediaPlaybackUserVideoFirstResolveTable } from "../../../db/schema";

const { returningMock, onConflictMock, valuesMock, insertMock, getDrizzleMock, loggerErrorMock } = vi.hoisted(
  () => ({
    returningMock: vi.fn(),
    onConflictMock: vi.fn(() => ({ returning: returningMock })),
    valuesMock: vi.fn(() => ({ onConflictDoNothing: onConflictMock })),
    insertMock: vi.fn(() => ({ values: valuesMock })),
    getDrizzleMock: vi.fn(() => ({ insert: insertMock })),
    loggerErrorMock: vi.fn(),
  }),
);

vi.mock("@/app-layer/db/drizzle", () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: { error: loggerErrorMock },
}));

import { recordPlaybackUserVideoFirstResolve } from "./playbackUserVideoFirstResolve";

describe("recordPlaybackUserVideoFirstResolve", () => {
  const uid = "11111111-1111-4111-8111-111111111111";
  const mid = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    returningMock.mockReset();
    onConflictMock.mockReset();
    valuesMock.mockReset();
    insertMock.mockReset();
    getDrizzleMock.mockReset();
    loggerErrorMock.mockReset();

    returningMock.mockResolvedValue(undefined);
    onConflictMock.mockImplementation(() => ({ returning: returningMock }));
    valuesMock.mockImplementation(() => ({ onConflictDoNothing: onConflictMock }));
    insertMock.mockImplementation(() => ({ values: valuesMock }));
    getDrizzleMock.mockImplementation(() => ({ insert: insertMock }));
  });

  it("returns false when userId is not a UUID", async () => {
    await expect(recordPlaybackUserVideoFirstResolve({ userId: "tg:x", mediaId: mid })).resolves.toBe(false);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns true when insert yields a returning row (first pair)", async () => {
    returningMock.mockResolvedValueOnce([{ mediaId: mid }]);
    await expect(recordPlaybackUserVideoFirstResolve({ userId: uid, mediaId: mid })).resolves.toBe(true);
    expect(getDrizzleMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(mediaPlaybackUserVideoFirstResolveTable);
    expect(valuesMock).toHaveBeenCalledWith({ userId: uid, mediaId: mid });
    expect(onConflictMock).toHaveBeenCalledWith({
      target: [mediaPlaybackUserVideoFirstResolveTable.userId, mediaPlaybackUserVideoFirstResolveTable.mediaId],
    });
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });

  it("returns false when conflict (no returning row)", async () => {
    returningMock.mockResolvedValueOnce([]);
    await expect(recordPlaybackUserVideoFirstResolve({ userId: uid, mediaId: mid })).resolves.toBe(false);
  });
});
