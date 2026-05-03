import { describe, expect, it } from "vitest";
import {
  lfkTemplateFilterFromPubArch,
  parseDoctorCatalogPubArchQuery,
  parseRecommendationListFilterScope,
  parseTemplateCourseCatalogListStatus,
  testSetListFilterFromDoctorApiGetQuery,
  testSetListFilterFromPubArch,
  treatmentProgramTemplateFilterFromPubArch,
} from "./doctorCatalogListStatus";

describe("doctorCatalogListStatus", () => {
  it("treats an empty status field as the default active scope", () => {
    expect(parseRecommendationListFilterScope({ status: "" })).toBe("active");
    expect(parseTemplateCourseCatalogListStatus({ status: "" })).toBe("active");
  });

  it("keeps archived scope and treats legacy all as active", () => {
    expect(parseRecommendationListFilterScope({ status: "all" })).toBe("active");
    expect(parseRecommendationListFilterScope({ status: "archived" })).toBe("archived");
  });
});

describe("parseDoctorCatalogPubArchQuery", () => {
  it("defaults to active + all", () => {
    expect(parseDoctorCatalogPubArchQuery({})).toEqual({ arch: "active", pub: "all" });
  });

  it("reads explicit arch and pub", () => {
    expect(parseDoctorCatalogPubArchQuery({ arch: "archived", pub: "draft" })).toEqual({
      arch: "archived",
      pub: "draft",
    });
  });

  it("maps legacy status=archived", () => {
    expect(parseDoctorCatalogPubArchQuery({ status: "archived" })).toEqual({
      arch: "archived",
      pub: "all",
    });
  });

  it("maps legacy status=draft to pub draft", () => {
    expect(parseDoctorCatalogPubArchQuery({ status: "draft" })).toEqual({ arch: "active", pub: "draft" });
  });

  it("prefers explicit pub over legacy status when arch is explicit", () => {
    expect(parseDoctorCatalogPubArchQuery({ arch: "active", status: "draft", pub: "published" })).toEqual({
      arch: "active",
      pub: "published",
    });
  });

  it("prefers explicit pub over legacy status=draft without arch param", () => {
    expect(parseDoctorCatalogPubArchQuery({ status: "draft", pub: "published" })).toEqual({
      arch: "active",
      pub: "published",
    });
  });
});

describe("catalog filter builders (B1)", () => {
  it("lfkTemplateFilterFromPubArch", () => {
    expect(lfkTemplateFilterFromPubArch({ arch: "archived", pub: "all" })).toEqual({ status: "archived" });
    expect(lfkTemplateFilterFromPubArch({ arch: "active", pub: "draft" })).toEqual({ status: "draft" });
    expect(lfkTemplateFilterFromPubArch({ arch: "active", pub: "all" })).toEqual({
      statusIn: ["draft", "published"],
    });
  });

  it("treatmentProgramTemplateFilterFromPubArch", () => {
    expect(treatmentProgramTemplateFilterFromPubArch({ arch: "archived", pub: "draft" })).toEqual({
      includeArchived: true,
      status: "archived",
    });
    expect(treatmentProgramTemplateFilterFromPubArch({ arch: "active", pub: "all" })).toEqual({
      includeArchived: false,
    });
  });

  it("testSetListFilterFromDoctorApiGetQuery", () => {
    expect(
      testSetListFilterFromDoctorApiGetQuery({
        q: "  x  ",
        includeArchived: true,
      }),
    ).toEqual({ search: "x", archiveScope: "all", publicationScope: "all" });
    expect(
      testSetListFilterFromDoctorApiGetQuery({
        arch: "archived",
        publicationScope: "draft",
      }),
    ).toEqual({ search: null, archiveScope: "archived", publicationScope: "draft" });
    expect(testSetListFilterFromDoctorApiGetQuery({})).toEqual({
      search: null,
      archiveScope: "active",
      publicationScope: "all",
    });
  });
});
