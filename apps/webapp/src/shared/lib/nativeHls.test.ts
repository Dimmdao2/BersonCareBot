import { describe, expect, it } from "vitest";
import { shouldUseNativeHls } from "./nativeHls";

describe("shouldUseNativeHls", () => {
  it("returns true when canPlayType is non-empty for apple mpegurl", () => {
    const probe = { canPlayType: (mime: string) => (mime.includes("mpegurl") ? "maybe" : "") };
    expect(shouldUseNativeHls(probe)).toBe(true);
  });

  it("returns false when canPlayType returns empty string", () => {
    const probe = { canPlayType: () => "" };
    expect(shouldUseNativeHls(probe)).toBe(false);
  });

  it("returns false when probe missing and no document (node)", () => {
    expect(shouldUseNativeHls(undefined)).toBe(false);
  });
});
