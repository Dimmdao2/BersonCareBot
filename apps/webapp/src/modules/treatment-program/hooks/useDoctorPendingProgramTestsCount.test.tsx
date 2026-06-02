/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDoctorPendingProgramTestsCount } from "./useDoctorPendingProgramTestsCount";

describe("useDoctorPendingProgramTestsCount", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts at zero and updates from summary API", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 5 }), { status: 200 }),
    );
    const { result } = renderHook(() => useDoctorPendingProgramTestsCount());
    expect(result.current).toBe(0);
    await waitFor(() => {
      expect(result.current).toBe(5);
    });
    expect(fetch).toHaveBeenCalledWith("/api/doctor/pending-program-tests/summary");
  });

  it("ignores invalid count in response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: "nope" }), { status: 200 }),
    );
    const { result } = renderHook(() => useDoctorPendingProgramTestsCount());
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    expect(result.current).toBe(0);
  });
});
