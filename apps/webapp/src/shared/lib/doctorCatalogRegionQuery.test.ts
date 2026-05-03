import { describe, expect, it } from "vitest";
import { parseDoctorCatalogRegionQueryParam } from "./doctorCatalogRegionQuery";

describe("parseDoctorCatalogRegionQueryParam", () => {
  it("returns normalized code for valid token", () => {
    expect(parseDoctorCatalogRegionQueryParam("  spine ")).toEqual({ regionCode: "spine" });
    expect(parseDoctorCatalogRegionQueryParam("KNEE")).toEqual({ regionCode: "knee" });
  });

  it("drops UUID without separate error flag", () => {
    expect(
      parseDoctorCatalogRegionQueryParam("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    ).toEqual({ regionCode: undefined });
  });

  it("drops values that fail code-token sanity (spaces, punctuation)", () => {
    expect(parseDoctorCatalogRegionQueryParam("not a code")).toEqual({ regionCode: undefined });
    expect(parseDoctorCatalogRegionQueryParam("bad!")).toEqual({ regionCode: undefined });
  });

  it("treats empty as no filter", () => {
    expect(parseDoctorCatalogRegionQueryParam(undefined)).toEqual({ regionCode: undefined });
    expect(parseDoctorCatalogRegionQueryParam("   ")).toEqual({ regionCode: undefined });
  });
});
