import { describe, expect, it } from "vitest";
import { parseDoctorCatalogRegionQueryParam } from "./doctorCatalogRegionQuery";

describe("parseDoctorCatalogRegionQueryParam", () => {
  it("returns code for non-uuid token", () => {
    expect(parseDoctorCatalogRegionQueryParam("  spine ")).toEqual({
      regionCode: "spine",
      invalidRegionQuery: false,
    });
  });

  it("flags uuid as invalid and drops code", () => {
    expect(
      parseDoctorCatalogRegionQueryParam("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).toEqual({
      regionCode: undefined,
      invalidRegionQuery: true,
    });
  });

  it("treats empty as no filter", () => {
    expect(parseDoctorCatalogRegionQueryParam(undefined)).toEqual({
      regionCode: undefined,
      invalidRegionQuery: false,
    });
    expect(parseDoctorCatalogRegionQueryParam("   ")).toEqual({
      regionCode: undefined,
      invalidRegionQuery: false,
    });
  });
});
