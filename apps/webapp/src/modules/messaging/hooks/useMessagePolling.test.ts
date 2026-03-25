// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMessagePolling } from "./useMessagePolling";

let visibilityStateMock: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibilityStateMock,
});

afterEach(() => {
  vi.useRealTimers();
  visibilityStateMock = "visible";
});

describe("useMessagePolling", () => {
  it("exports hook function", async () => {
    const mod = await import("./useMessagePolling");
    expect(typeof mod.useMessagePolling).toBe("function");
  });

  it("polls immediately, pauses on hidden, resumes on visible", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    renderHook(() => useMessagePolling(onTick, true, 1000));

    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);

    visibilityStateMock = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(2);

    visibilityStateMock = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(onTick).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(4);
  });

  it("does not start polling when disabled", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    renderHook(() => useMessagePolling(onTick, false, 1000));
    vi.advanceTimersByTime(3000);
    expect(onTick).not.toHaveBeenCalled();
  });
});
