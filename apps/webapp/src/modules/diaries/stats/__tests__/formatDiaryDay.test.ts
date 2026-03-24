import { describe, expect, it } from "vitest";
import { formatDiaryDayShortRu } from "../formatDiaryDay";

describe("formatDiaryDayShortRu", () => {
  it("formats valid ISO day", () => {
    const s = formatDiaryDayShortRu("2025-03-15");
    expect(s.length).toBeGreaterThan(0);
    expect(s).toMatch(/15/);
  });

  it("returns input on malformed string", () => {
    expect(formatDiaryDayShortRu("bad")).toBe("bad");
  });
});
