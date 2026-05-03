/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDoctorCatalogDisplayList } from "./useDoctorCatalogDisplayList";

type Row = { title: string; id: string; regionCode: string | null; load: "strength" | "stretch" | null };

describe("useDoctorCatalogDisplayList", () => {
  const rows: Row[] = [
    { id: "1", title: "Альфа", regionCode: "spine", load: "strength" },
    { id: "2", title: "Бета", regionCode: "knee", load: "stretch" },
  ];

  it("filters by region code when getItemRegionCode provided", () => {
    const { result } = renderHook(() =>
      useDoctorCatalogDisplayList(rows, "", "default", {
        regionCode: "spine",
        getItemRegionCode: (r) => r.regionCode,
      }),
    );
    expect(result.current.map((r) => r.id)).toEqual(["1"]);
  });

  it("filters by load when getItemLoadType provided", () => {
    const { result } = renderHook(() =>
      useDoctorCatalogDisplayList(rows, "", "default", {
        loadType: "stretch",
        getItemLoadType: (r) => r.load,
      }),
    );
    expect(result.current.map((r) => r.id)).toEqual(["2"]);
  });
});
