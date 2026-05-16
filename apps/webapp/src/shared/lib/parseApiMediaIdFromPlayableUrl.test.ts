import { describe, expect, it } from "vitest";
import {
  parseApiMediaIdFromHref,
  parseApiMediaIdFromMarkdownHref,
  parseApiMediaIdFromPlayableUrl,
} from "./parseApiMediaIdFromPlayableUrl";

const SAMPLE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("parseApiMediaIdFromPlayableUrl", () => {
  it("extracts uuid from path", () => {
    expect(parseApiMediaIdFromPlayableUrl(`/api/media/${SAMPLE_ID}`)).toBe(SAMPLE_ID);
  });

  it("strips query and hash", () => {
    expect(parseApiMediaIdFromPlayableUrl(`/api/media/${SAMPLE_ID}?x=1#frag`)).toBe(SAMPLE_ID);
  });

  it("rejects wrong shape", () => {
    expect(parseApiMediaIdFromPlayableUrl(`/api/media/${SAMPLE_ID}/extra`)).toBeNull();
    expect(parseApiMediaIdFromPlayableUrl(`https://evil.example/api/media/${SAMPLE_ID}`)).toBeNull();
  });
});

describe("parseApiMediaIdFromHref", () => {
  const trusted = "https://app.example";

  it("matches absolute URL when origin trusted", () => {
    expect(parseApiMediaIdFromHref(`https://app.example/api/media/${SAMPLE_ID}`, trusted)).toBe(SAMPLE_ID);
  });

  it("rejects foreign origin", () => {
    expect(parseApiMediaIdFromHref(`https://evil.example/api/media/${SAMPLE_ID}`, trusted)).toBeNull();
  });

  it("handles relative without requiring trustedOrigin", () => {
    expect(parseApiMediaIdFromHref(`/api/media/${SAMPLE_ID}`, null)).toBe(SAMPLE_ID);
  });

  it("requires trustedOrigin for absolute", () => {
    expect(parseApiMediaIdFromHref(`https://app.example/api/media/${SAMPLE_ID}`, null)).toBeNull();
  });
});

describe("parseApiMediaIdFromMarkdownHref", () => {
  it("matches relative path without trying origins", () => {
    expect(parseApiMediaIdFromMarkdownHref(`/api/media/${SAMPLE_ID}`, [])).toBe(SAMPLE_ID);
  });

  it("iterates origins until match", () => {
    expect(
      parseApiMediaIdFromMarkdownHref(`https://app.example/api/media/${SAMPLE_ID}`, [
        "https://wrong.example",
        "https://app.example",
      ]),
    ).toBe(SAMPLE_ID);
  });

  it("returns null when no origin matches absolute URL", () => {
    expect(
      parseApiMediaIdFromMarkdownHref(`https://evil.example/api/media/${SAMPLE_ID}`, ["https://app.example"]),
    ).toBeNull();
  });
});
