import { describe, expect, it, vi } from "vitest";
import { ensureDailyWarmupPresentationSynced } from "./ensureDailyWarmupPresentationSynced";

const syncMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());

vi.mock("./syncDailyWarmupScheduledRotation", () => ({
  syncDailyWarmupScheduledRotation: syncMock,
}));

vi.mock("./todayConfig", () => ({
  listDailyWarmupPagesForHome: listMock,
}));

describe("ensureDailyWarmupPresentationSynced", () => {
  it("returns synced content page id", async () => {
    listMock.mockResolvedValue([{ contentPageId: "a" }, { contentPageId: "b" }]);
    syncMock.mockResolvedValue({
      contentPageId: "b",
      lastRotationAt: "2026-06-09T08:00:00.000Z",
      skipNextScheduledRotation: false,
    });

    const id = await ensureDailyWarmupPresentationSynced("user-1", {} as never);
    expect(id).toBe("b");
  });

  it("falls back to next after last completed when sync returns null", async () => {
    listMock.mockResolvedValue([{ contentPageId: "a" }, { contentPageId: "b" }]);
    syncMock.mockResolvedValue(null);
    const deps = {
      patientPractice: {
        getLatestDailyWarmupCompletedContentPageId: vi.fn(async () => "a"),
      },
    };

    const id = await ensureDailyWarmupPresentationSynced("user-1", deps as never);
    expect(id).toBe("b");
  });
});
