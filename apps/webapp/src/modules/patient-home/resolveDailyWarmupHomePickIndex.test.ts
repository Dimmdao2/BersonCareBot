import { describe, expect, it } from "vitest";
import { resolveDailyWarmupHomePickIndex } from "./resolveDailyWarmupHomePickIndex";

const pages = [{ contentPageId: "a" }, { contentPageId: "b" }];

describe("resolveDailyWarmupHomePickIndex", () => {
  it("prefers presented over last completed", () => {
    expect(resolveDailyWarmupHomePickIndex(pages, "b", "a")).toBe(1);
  });

  it("falls back to last completed index", () => {
    expect(resolveDailyWarmupHomePickIndex(pages, null, "a")).toBe(0);
  });

  it("returns 0 when no anchors", () => {
    expect(resolveDailyWarmupHomePickIndex(pages, null, null)).toBe(0);
  });
});
