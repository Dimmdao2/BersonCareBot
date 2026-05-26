import { describe, expect, it } from "vitest";
import { pickDailyWarmupFromOrderedList } from "./pickDailyWarmupFromOrderedList";

const pages = [
  { contentPageId: "a" },
  { contentPageId: "b" },
  { contentPageId: "c" },
];

describe("pickDailyWarmupFromOrderedList", () => {
  it("returns 0 when list is empty", () => {
    expect(pickDailyWarmupFromOrderedList([], null)).toBe(0);
  });

  it("returns 0 when no completions", () => {
    expect(pickDailyWarmupFromOrderedList(pages, null)).toBe(0);
  });

  it("returns next after last completed", () => {
    expect(pickDailyWarmupFromOrderedList(pages, "a")).toBe(1);
    expect(pickDailyWarmupFromOrderedList(pages, "b")).toBe(2);
  });

  it("wraps from last to first", () => {
    expect(pickDailyWarmupFromOrderedList(pages, "c")).toBe(0);
  });

  it("returns 0 when last completed is not in list", () => {
    expect(pickDailyWarmupFromOrderedList(pages, "missing")).toBe(0);
  });
});
