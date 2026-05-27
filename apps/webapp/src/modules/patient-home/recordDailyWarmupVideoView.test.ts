import { describe, expect, it, vi, beforeEach } from "vitest";

const isContentPageInDailyWarmupBlockMock = vi.hoisted(() => vi.fn());
const listDailyWarmupPagesForHomeMock = vi.hoisted(() => vi.fn());
const advanceDailyWarmupPresentationAfterVideoViewMock = vi.hoisted(() => vi.fn());

vi.mock("./todayConfig", () => ({
  isContentPageInDailyWarmupBlock: isContentPageInDailyWarmupBlockMock,
  listDailyWarmupPagesForHome: listDailyWarmupPagesForHomeMock,
}));

vi.mock("./advanceDailyWarmupPresentationAfterVideoView", () => ({
  advanceDailyWarmupPresentationAfterVideoView: advanceDailyWarmupPresentationAfterVideoViewMock,
}));

import { recordDailyWarmupVideoView } from "./recordDailyWarmupVideoView";

const PAGE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PAGE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("recordDailyWarmupVideoView", () => {
  beforeEach(() => {
    isContentPageInDailyWarmupBlockMock.mockReset();
    listDailyWarmupPagesForHomeMock.mockReset();
    advanceDailyWarmupPresentationAfterVideoViewMock.mockReset();
    isContentPageInDailyWarmupBlockMock.mockResolvedValue(true);
    listDailyWarmupPagesForHomeMock.mockResolvedValue([
      { id: PAGE_A, slug: "a", title: "A", sortOrder: 0 },
      { id: PAGE_B, slug: "b", title: "B", sortOrder: 1 },
    ]);
    advanceDailyWarmupPresentationAfterVideoViewMock.mockResolvedValue(undefined);
  });

  it("records view and advances presentation when page is in daily_warmup block", async () => {
    const recordView = vi.fn();
    const setPresentedContentPageId = vi.fn();
    const result = await recordDailyWarmupVideoView(USER, PAGE_A, {
      patientHomeBlocks: {},
      contentPages: {},
      contentSections: {},
      systemSettings: {},
      patientDailyWarmupPresentation: {
        getPresentedContentPageId: vi.fn(),
        setPresentedContentPageId,
      },
      patientDailyWarmupVideoViews: { recordView },
    } as never);

    expect(result).toEqual({ ok: true });
    expect(recordView).toHaveBeenCalledWith(USER, PAGE_A);
    expect(advanceDailyWarmupPresentationAfterVideoViewMock).toHaveBeenCalled();
    expect(setPresentedContentPageId).not.toHaveBeenCalled();
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
    } as never);
    expect(result).toEqual({ ok: false, error: "not_daily_warmup" });
    expect(recordView).not.toHaveBeenCalled();
    expect(advanceDailyWarmupPresentationAfterVideoViewMock).not.toHaveBeenCalled();
  });
});
