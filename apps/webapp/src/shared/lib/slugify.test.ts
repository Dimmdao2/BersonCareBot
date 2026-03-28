import { describe, expect, it } from "vitest";
import { fallbackSlug, slugFromTitle } from "./slugify";

describe("slugFromTitle", () => {
  it("латинский заголовок → slug", () => {
    expect(slugFromTitle("Back pain basics")).toBe("back-pain-basics");
  });

  it("только кириллица → null", () => {
    expect(slugFromTitle("Разминка для шеи")).toBeNull();
  });

  it("нормализует пробелы", () => {
    expect(slugFromTitle("  Neck  Warmup  ")).toBe("neck-warmup");
  });

  it("только дефисы → null", () => {
    expect(slugFromTitle("---")).toBeNull();
  });

  it("пустая строка → null", () => {
    expect(slugFromTitle("")).toBeNull();
  });

  it("смешанный текст: остаётся латиница", () => {
    expect(slugFromTitle("Боль в спине / Back")).toBe("back");
  });
});

describe("fallbackSlug", () => {
  it("из uuid без дефисов — первые 8 hex", () => {
    expect(fallbackSlug("3f7a91bc-1234-5678-abcd-ef0123456789")).toBe(
      "article-3f7a91bc",
    );
  });

  it("без seed — article- + 8 hex", () => {
    const s = fallbackSlug();
    expect(s.startsWith("article-")).toBe(true);
    expect(s).toHaveLength(16);
    expect(/^article-[0-9a-f]{8}$/.test(s)).toBe(true);
  });
});
