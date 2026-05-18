import { afterEach, describe, expect, it, vi } from "vitest";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

describe("isStandalonePwa", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when not standalone", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: false },
    });
    expect(isStandalonePwa()).toBe(false);
  });

  it("detects display-mode standalone", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      navigator: {},
    });
    expect(isStandalonePwa()).toBe(true);
  });

  it("detects iOS navigator.standalone", () => {
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      navigator: { standalone: true },
    });
    expect(isStandalonePwa()).toBe(true);
  });
});
