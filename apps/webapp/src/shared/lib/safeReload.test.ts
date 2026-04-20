/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setBuildIdMeta(buildId: string) {
  const existing = document.querySelector('meta[name="x-build-id"]');
  if (existing) existing.remove();
  const meta = document.createElement("meta");
  meta.setAttribute("name", "x-build-id");
  meta.setAttribute("content", buildId);
  document.head.appendChild(meta);
}

describe("safeReload", () => {
  const originalLocation = window.location;
  let replaceMock: ReturnType<typeof vi.fn>;
  let currentPathname = "/app/patient";

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_AUTO_RELOAD_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "production");

    sessionStorage.clear();
    localStorage.clear();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    setBuildIdMeta("build-a");

    replaceMock = vi.fn();
    currentPathname = "/app/patient";
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        href: "https://example.com/app/patient",
        get pathname() {
          return currentPathname;
        },
        replace: replaceMock,
      },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(async () => {
    const mod = await import("@/shared/lib/safeReload");
    mod.__resetSafeReloadForTests();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reloads when guards pass", async () => {
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(true);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("blocks reload on cooldown", async () => {
    const { safeReload } = await import("@/shared/lib/safeReload");
    await safeReload("version-mismatch", "build-b");
    const second = await safeReload("version-mismatch", "build-b");
    expect(second).toBe(false);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("stops after max loop count", async () => {
    sessionStorage.setItem(
      "bcb:reload",
      JSON.stringify({
        lastReloadAt: Date.now() - 200_000,
        count: 3,
        windowStartedAt: Date.now() - 1000,
        lastBuildId: "build-a",
      }),
    );
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("defers when active input is focused", async () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("defers when another tab lock is active", async () => {
    localStorage.setItem(
      "bcb:reload:pending",
      JSON.stringify({ takenAt: Date.now(), tabId: "tab-other" }),
    );
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("allows reload when another-tab lock is expired", async () => {
    localStorage.setItem(
      "bcb:reload:pending",
      JSON.stringify({ takenAt: Date.now() - 20_000, tabId: "tab-other" }),
    );
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(true);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("defers when tab is hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("defers on denylist path", async () => {
    currentPathname = "/app/patient/tests/flow";
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("breaks loop when previous reload already had same build id", async () => {
    sessionStorage.setItem(
      "bcb:reload",
      JSON.stringify({
        lastReloadAt: Date.now() - 200_000,
        count: 1,
        windowStartedAt: Date.now() - 1_000,
        lastBuildId: "build-a",
      }),
    );
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not accumulate deferred listeners across repeated calls", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const { safeReload } = await import("@/shared/lib/safeReload");
    await safeReload("version-mismatch", "build-b");
    await safeReload("version-mismatch", "build-b");

    const focusAdds = addSpy.mock.calls.filter(([eventName]) => eventName === "focus");
    const pointerAdds = addSpy.mock.calls.filter(([eventName]) => eventName === "pointerup");
    const visibilityAdds = addSpy.mock.calls.filter(([eventName]) => eventName === "visibilitychange");
    expect(focusAdds).toHaveLength(1);
    expect(pointerAdds).toHaveLength(1);
    expect(visibilityAdds).toHaveLength(1);
  });

  it("fails closed when storage access throws", async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage-blocked");
    });
    const { safeReload } = await import("@/shared/lib/safeReload");
    const result = await safeReload("version-mismatch", "build-b");
    expect(result).toBe(false);
    expect(replaceMock).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
  });
});
