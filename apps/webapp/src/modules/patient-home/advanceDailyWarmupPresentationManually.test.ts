import { describe, expect, it, vi } from "vitest";
import { advanceDailyWarmupPresentationManually } from "./advanceDailyWarmupPresentationManually";
import type { SyncDailyWarmupScheduledRotationDeps } from "./syncDailyWarmupScheduledRotation";

const ensureMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());

vi.mock("./ensureDailyWarmupPresentationSynced", () => ({
  ensureDailyWarmupPresentationSynced: ensureMock,
}));

vi.mock("./todayConfig", () => ({
  listDailyWarmupPagesForHome: listMock,
}));

describe("advanceDailyWarmupPresentationManually", () => {
  it("no-ops when anchor is not current presented", async () => {
    ensureMock.mockResolvedValue("b");
    listMock.mockResolvedValue([
      { contentPageId: "a", slug: "a" },
      { contentPageId: "b", slug: "b" },
    ]);
    const upsert = vi.fn();
    const result = await advanceDailyWarmupPresentationManually("user-1", "a", {
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: { getSetting: vi.fn() },
      patientDailyWarmupPresentation: {
        getPresentationState: vi.fn(),
        upsertPresentationState: upsert,
        getPresentedContentPageId: vi.fn(),
        setPresentedContentPageId: vi.fn(),
      },
      patientPractice: { getLatestDailyWarmupCompletedContentPageId: vi.fn() },
      patientCalendarTimezone: { getIanaForUser: vi.fn() },
    } as unknown as SyncDailyWarmupScheduledRotationDeps);
    expect(result).toEqual({ advanced: false, reason: "not_current_presented" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("advances with skip when anchor matches presented", async () => {
    ensureMock.mockResolvedValue("a");
    listMock.mockResolvedValue([
      { contentPageId: "a", slug: "a" },
      { contentPageId: "b", slug: "b" },
    ]);
    const upsert = vi.fn();
    const result = await advanceDailyWarmupPresentationManually(
      "user-1",
      "a",
      {
        patientHomeBlocks: {},
        contentPages: {},
        contentSections: {},
        systemSettings: { getSetting: vi.fn() },
        patientDailyWarmupPresentation: {
          getPresentationState: vi.fn(),
          upsertPresentationState: upsert,
          getPresentedContentPageId: vi.fn(),
          setPresentedContentPageId: vi.fn(),
        },
        patientPractice: { getLatestDailyWarmupCompletedContentPageId: vi.fn() },
        patientCalendarTimezone: { getIanaForUser: vi.fn() },
      } as unknown as SyncDailyWarmupScheduledRotationDeps,
      new Date("2026-06-09T12:00:00.000Z"),
    );
    expect(result).toEqual({ advanced: true, nextContentPageId: "b" });
    expect(upsert).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        contentPageId: "b",
        skipNextScheduledRotation: true,
        lastRotationAt: "2026-06-09T12:00:00.000Z",
      }),
    );
  });

  it("no-ops on second manual advance with same anchor (video then completion)", async () => {
    ensureMock.mockResolvedValueOnce("a").mockResolvedValueOnce("b");
    listMock.mockResolvedValue([
      { contentPageId: "a", slug: "a" },
      { contentPageId: "b", slug: "b" },
    ]);
    const upsert = vi.fn();
    const deps = {
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: { getSetting: vi.fn() },
      patientDailyWarmupPresentation: {
        getPresentationState: vi.fn(),
        upsertPresentationState: upsert,
        getPresentedContentPageId: vi.fn(),
        setPresentedContentPageId: vi.fn(),
      },
      patientPractice: { getLatestDailyWarmupCompletedContentPageId: vi.fn() },
      patientCalendarTimezone: { getIanaForUser: vi.fn() },
    } as unknown as SyncDailyWarmupScheduledRotationDeps;

    const first = await advanceDailyWarmupPresentationManually("user-1", "a", deps);
    const second = await advanceDailyWarmupPresentationManually("user-1", "a", deps);

    expect(first).toEqual({ advanced: true, nextContentPageId: "b" });
    expect(second).toEqual({ advanced: false, reason: "not_current_presented" });
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
