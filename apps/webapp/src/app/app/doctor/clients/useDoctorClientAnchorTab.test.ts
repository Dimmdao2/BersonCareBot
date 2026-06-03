/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { useDoctorClientAnchorTab } from "./useDoctorClientAnchorTab";

describe("useDoctorClientAnchorTab", () => {
  const originalHref = window.location.href;

  beforeEach(() => {
    window.history.replaceState(
      null,
      "",
      "/app/doctor/clients/patient-1?scope=appointments",
    );
  });

  afterEach(() => {
    window.history.replaceState(null, "", originalHref);
  });

  it("applyAnchor preserves pathname and query when updating hash", () => {
    const { result } = renderHook(() => useDoctorClientAnchorTab("overview"));

    act(() => {
      result.current.applyAnchor("doctor-client-section-program-inbox");
    });

    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/app/doctor/clients/patient-1");
    expect(url.searchParams.get("scope")).toBe("appointments");
    expect(url.hash).toBe("#doctor-client-section-program-inbox");
    expect(result.current.activeTab).toBe("program");
  });

  it("applyAnchor with replaceHash false does not change location", () => {
    const { result } = renderHook(() => useDoctorClientAnchorTab("overview"));

    act(() => {
      result.current.applyAnchor("doctor-client-section-treatment-programs", {
        replaceHash: false,
      });
    });

    expect(window.location.pathname).toBe("/app/doctor/clients/patient-1");
    expect(window.location.search).toBe("?scope=appointments");
    expect(window.location.hash).toBe("");
    expect(result.current.activeTab).toBe("program");
  });
});
