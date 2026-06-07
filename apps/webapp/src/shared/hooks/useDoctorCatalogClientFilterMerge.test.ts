/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DOCTOR_CATALOG_URL_SYNC_EVENT } from "@/shared/lib/doctorCatalogClientUrlSync";
import { useDoctorCatalogClientFilterMerge } from "./useDoctorCatalogClientFilterMerge";

describe("useDoctorCatalogClientFilterMerge", () => {
  it("applies loadType from URL and clears it when load param is removed", () => {
    window.history.replaceState({}, "", "/app/doctor/exercises?load=strength");

    const { result, rerender } = renderHook(
      ({ scope }) => useDoctorCatalogClientFilterMerge(scope),
      {
        initialProps: {
          scope: {
            listStatus: "active",
            loadType: "stretch" as const,
            hasLoadParam: true,
          },
        },
      },
    );

    expect(result.current.loadType).toBe("strength");

    act(() => {
      window.history.replaceState({}, "", "/app/doctor/exercises");
      window.dispatchEvent(new Event(DOCTOR_CATALOG_URL_SYNC_EVENT));
    });
    rerender({
      scope: {
        listStatus: "active",
        loadType: "stretch" as const,
        hasLoadParam: true,
      },
    });

    expect(result.current.loadType).toBeUndefined();
    expect(result.current.hasLoadParam).toBe(false);
  });
});
