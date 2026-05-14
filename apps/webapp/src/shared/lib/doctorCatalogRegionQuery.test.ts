import { describe, expect, it } from "vitest";
import {
  parseDoctorCatalogRegionQueryParam,
  resolveBodyRegionRefIdFromCatalogCode,
} from "./doctorCatalogRegionQuery";

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

describe("resolveBodyRegionRefIdFromCatalogCode", () => {
  const spineId = "11111111-1111-4111-8111-111111111111";
  const items = [
    {
      id: spineId,
      categoryId: "c",
      code: "spine",
      title: "Позвоночник",
      sortOrder: 0,
      isActive: true,
      deletedAt: null,
      metaJson: {},
    },
  ];

  it("returns id when code matches case-insensitively", () => {
    expect(resolveBodyRegionRefIdFromCatalogCode(items, "SPINE")).toBe(spineId);
    expect(resolveBodyRegionRefIdFromCatalogCode(items, "spine")).toBe(spineId);
  });

  it("returns null when code missing or unknown", () => {
    expect(resolveBodyRegionRefIdFromCatalogCode(items, undefined)).toBeNull();
    expect(resolveBodyRegionRefIdFromCatalogCode(items, "hip")).toBeNull();
  });
});
