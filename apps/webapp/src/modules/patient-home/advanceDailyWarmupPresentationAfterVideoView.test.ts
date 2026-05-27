import { describe, expect, it, vi } from "vitest";
import { advanceDailyWarmupPresentationAfterVideoView } from "./advanceDailyWarmupPresentationAfterVideoView";

const pages = [
  { contentPageId: "a" },
  { contentPageId: "b" },
  { contentPageId: "c" },
];

describe("advanceDailyWarmupPresentationAfterVideoView", () => {
  it("sets presented to next page after viewed", async () => {
    const setPresented = vi.fn(async () => {});
    await advanceDailyWarmupPresentationAfterVideoView("user-1", "a", pages, {
      setPresentedContentPageId: setPresented,
    });
    expect(setPresented).toHaveBeenCalledWith("user-1", "b");
  });

  it("wraps from last page to first", async () => {
    const setPresented = vi.fn(async () => {});
    await advanceDailyWarmupPresentationAfterVideoView("user-1", "c", pages, {
      setPresentedContentPageId: setPresented,
    });
    expect(setPresented).toHaveBeenCalledWith("user-1", "a");
  });
});
