import { describe, expect, it, vi, beforeEach } from "vitest";

const isContentPageInDailyWarmupBlockMock = vi.hoisted(() => vi.fn());
const advanceDailyWarmupPresentationManuallyMock = vi.hoisted(() => vi.fn());

vi.mock("./todayConfig", () => ({
  isContentPageInDailyWarmupBlock: isContentPageInDailyWarmupBlockMock,
}));

vi.mock("./advanceDailyWarmupPresentationManually", () => ({
  advanceDailyWarmupPresentationManually: advanceDailyWarmupPresentationManuallyMock,
}));

import { recordDailyWarmupVideoView } from "./recordDailyWarmupVideoView";

const PAGE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("recordDailyWarmupVideoView", () => {
  beforeEach(() => {
    isContentPageInDailyWarmupBlockMock.mockReset();
    advanceDailyWarmupPresentationManuallyMock.mockReset();
    isContentPageInDailyWarmupBlockMock.mockResolvedValue(true);
    advanceDailyWarmupPresentationManuallyMock.mockResolvedValue({ advanced: true, nextContentPageId: "b" });
  });

  it("records view and advances presentation when page is in daily_warmup block", async () => {
    const recordView = vi.fn();
    const result = await recordDailyWarmupVideoView(USER, PAGE_A, {
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: {},
      patientDailyWarmupPresentation: {
        getPresentationState: vi.fn(),
        upsertPresentationState: vi.fn(),
        getPresentedContentPageId: vi.fn(),
        setPresentedContentPageId: vi.fn(),
      },
      patientDailyWarmupVideoViews: { recordView },
      patientPractice: { getLatestDailyWarmupCompletedContentPageId: vi.fn() },
      patientCalendarTimezone: { getIanaForUser: vi.fn() },
    } as never);

    expect(result).toEqual({ ok: true });
    expect(recordView).toHaveBeenCalledWith(USER, PAGE_A);
    expect(advanceDailyWarmupPresentationManuallyMock).toHaveBeenCalledWith(USER, PAGE_A, expect.any(Object));
  });

  it("returns not_daily_warmup when page is outside block", async () => {
    isContentPageInDailyWarmupBlockMock.mockResolvedValue(false);
    const recordView = vi.fn();
    const result = await recordDailyWarmupVideoView(USER, PAGE_A, {
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: {},
      patientDailyWarmupPresentation: {},
      patientDailyWarmupVideoViews: { recordView },
      patientPractice: {},
      patientCalendarTimezone: {},
    } as never);
    expect(result).toEqual({ ok: false, error: "not_daily_warmup" });
    expect(recordView).not.toHaveBeenCalled();
    expect(advanceDailyWarmupPresentationManuallyMock).not.toHaveBeenCalled();
  });
});
