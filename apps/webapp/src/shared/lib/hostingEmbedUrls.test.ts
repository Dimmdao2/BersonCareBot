import { describe, expect, it } from "vitest";
import { toRutubeEmbedSrc, toYoutubeEmbedSrc, toYoutubeOrRutubeEmbedSrc } from "./hostingEmbedUrls";

describe("toYoutubeEmbedSrc", () => {
  it("maps watch?v=", () => {
    expect(toYoutubeEmbedSrc("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("maps youtu.be", () => {
    expect(toYoutubeEmbedSrc("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("maps shorts path", () => {
    expect(toYoutubeEmbedSrc("https://youtube.com/shorts/abc123def")).toBe(
      "https://www.youtube.com/embed/abc123def",
    );
  });

  it("normalizes existing embed URL to https", () => {
    expect(toYoutubeEmbedSrc("http://www.youtube.com/embed/xyz")).toMatch(/^https:\/\/www\.youtube\.com\/embed\/xyz/);
  });
});

describe("toRutubeEmbedSrc", () => {
  it("normalizes play/embed path preserving params", () => {
    expect(toRutubeEmbedSrc("https://rutube.ru/play/embed/7163336/?quality=1")).toContain(
      "rutube.ru/play/embed/7163336",
    );
    expect(toRutubeEmbedSrc("https://rutube.ru/play/embed/7163336/?quality=1")).toContain("quality=1");
  });

  it("maps /video/{id}/ with private key", () => {
    expect(toRutubeEmbedSrc("https://rutube.ru/video/abc/?p=secret123")).toBe(
      "https://rutube.ru/play/embed/abc?p=secret123",
    );
  });

  it("maps /shorts/{id}", () => {
    expect(toRutubeEmbedSrc("https://rutube.ru/shorts/shortId")).toBe("https://rutube.ru/play/embed/shortId");
  });

  it("returns null for unrelated hosts", () => {
    expect(toRutubeEmbedSrc("https://example.com/video/x")).toBeNull();
  });
});

describe("toYoutubeOrRutubeEmbedSrc", () => {
  it("prefers youtube when youtube matches", () => {
    expect(toYoutubeOrRutubeEmbedSrc("https://www.youtube.com/watch?v=x")).toContain("youtube.com/embed");
  });

  it("falls back to rutube", () => {
    expect(toYoutubeOrRutubeEmbedSrc("https://rutube.ru/video/z")).toContain("rutube.ru/play/embed/z");
  });
});
