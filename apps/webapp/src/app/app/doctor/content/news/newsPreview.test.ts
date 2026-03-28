import { describe, expect, it } from "vitest";
import { firstNewsBodyLine } from "./newsPreview";

describe("firstNewsBodyLine", () => {
  it("берёт первую непустую строку и снимает заголовок markdown", () => {
    expect(firstNewsBodyLine("\n\n## Hello\nworld")).toBe("Hello");
  });

  it("возвращает пустую строку если только пустые строки", () => {
    expect(firstNewsBodyLine("  \n  \n")).toBe("");
  });
});
