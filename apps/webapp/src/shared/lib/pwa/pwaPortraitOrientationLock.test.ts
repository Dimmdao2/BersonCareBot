import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isLandscapeViewport,
  isVideoElementFullscreen,
  readDocumentFullscreenElement,
  syncPwaPortraitOrientationLock,
  tryLockPortraitOrientation,
  tryUnlockOrientation,
} from "@/shared/lib/pwa/pwaPortraitOrientationLock";

function mockDocumentElement() {
  const attrs = new Map<string, string>();
  return {
    dataset: {
      get pwaVideoFullscreen() {
        return attrs.get("data-pwa-video-fullscreen");
      },
      set pwaVideoFullscreen(value: string | undefined) {
        if (value === undefined) attrs.delete("data-pwa-video-fullscreen");
        else attrs.set("data-pwa-video-fullscreen", value);
      },
      get pwaOrientationFallback() {
        return attrs.get("data-pwa-orientation-fallback");
      },
      set pwaOrientationFallback(value: string | undefined) {
        if (value === undefined) attrs.delete("data-pwa-orientation-fallback");
        else attrs.set("data-pwa-orientation-fallback", value);
      },
    },
    removeAttribute(name: string) {
      attrs.delete(name);
    },
    getAttribute(name: string) {
      return attrs.get(name);
    },
  };
}

describe("pwaPortraitOrientationLock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects video fullscreen element", () => {
    expect(isVideoElementFullscreen({ localName: "video" } as Element)).toBe(true);
    expect(isVideoElementFullscreen({ localName: "div" } as Element)).toBe(false);
  });

  it("reads standard and webkit fullscreen element", () => {
    const video = { tagName: "VIDEO" } as Element;
    vi.stubGlobal("document", {
      fullscreenElement: video,
      webkitFullscreenElement: null,
    });
    expect(readDocumentFullscreenElement()).toBe(video);
  });

  it("locks portrait when API is available", async () => {
    const lock = vi.fn(async () => undefined);
    const unlock = vi.fn();
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
      screen: { orientation: { lock, unlock } },
    });

    await expect(tryLockPortraitOrientation()).resolves.toBe(true);
    expect(lock).toHaveBeenCalledWith("portrait-primary");
    tryUnlockOrientation();
    expect(unlock).toHaveBeenCalled();
  });

  it("unlocks and skips fallback while video is fullscreen", async () => {
    const unlock = vi.fn();
    const docEl = mockDocumentElement();
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      screen: { orientation: { unlock } },
    });
    vi.stubGlobal("document", {
      fullscreenElement: { localName: "video" } as Element,
      documentElement: docEl,
    });

    const result = await syncPwaPortraitOrientationLock({ webkitVideoFullscreen: false });
    expect(result.videoFullscreen).toBe(true);
    expect(docEl.dataset.pwaVideoFullscreen).toBe("1");
    expect(docEl.dataset.pwaOrientationFallback).toBeUndefined();
    expect(unlock).toHaveBeenCalled();
  });

  it("sets landscape fallback when lock API is unavailable", async () => {
    const docEl = mockDocumentElement();
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: true }),
      screen: { orientation: {} },
    });
    vi.stubGlobal("document", {
      fullscreenElement: null,
      documentElement: docEl,
    });

    const result = await syncPwaPortraitOrientationLock({ webkitVideoFullscreen: false });
    expect(result.fallbackLandscape).toBe(true);
    expect(docEl.dataset.pwaOrientationFallback).toBe("landscape");
  });

  it("detects landscape viewport", () => {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({ matches: query.includes("landscape") }),
    });
    expect(isLandscapeViewport()).toBe(true);
  });
});
