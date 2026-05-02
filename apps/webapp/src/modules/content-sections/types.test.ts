import { describe, expect, it } from "vitest";
import {
  classifyExistingContentSectionSlug,
  isImmutableSystemSectionSlug,
  isValidSectionTaxonomy,
  placementFromTaxonomy,
  systemParentCodeForPatientHomeBlock,
  taxonomyFromPlacement,
} from "./types";

describe("content-sections types", () => {
  it("classifyExistingContentSectionSlug matches CMS backfill rules", () => {
    expect(classifyExistingContentSectionSlug("warmups")).toEqual({
      kind: "system",
      systemParentCode: "warmups",
    });
    expect(classifyExistingContentSectionSlug("lessons")).toEqual({
      kind: "system",
      systemParentCode: "lessons",
    });
    expect(classifyExistingContentSectionSlug("course_lessons")).toEqual({
      kind: "system",
      systemParentCode: "lessons",
    });
    for (const slug of ["emergency", "materials", "workouts"]) {
      expect(classifyExistingContentSectionSlug(slug)).toEqual({
        kind: "system",
        systemParentCode: null,
      });
    }
    expect(classifyExistingContentSectionSlug("antistress")).toEqual({
      kind: "article",
      systemParentCode: null,
    });
  });

  it("isImmutableSystemSectionSlug lists built-in slugs", () => {
    expect(isImmutableSystemSectionSlug("warmups")).toBe(true);
    expect(isImmutableSystemSectionSlug("lessons")).toBe(true);
    expect(isImmutableSystemSectionSlug("custom-situation")).toBe(false);
  });

  it("isValidSectionTaxonomy rejects article + parent code", () => {
    expect(isValidSectionTaxonomy("article", null)).toBe(true);
    expect(isValidSectionTaxonomy("article", "situations")).toBe(false);
    expect(isValidSectionTaxonomy("system", "situations")).toBe(true);
    expect(isValidSectionTaxonomy("system", null)).toBe(true);
  });

  it("systemParentCodeForPatientHomeBlock maps known blocks", () => {
    expect(systemParentCodeForPatientHomeBlock("situations")).toBe("situations");
    expect(systemParentCodeForPatientHomeBlock("sos")).toBe("sos");
    expect(systemParentCodeForPatientHomeBlock("daily_warmup")).toBe("warmups");
    expect(systemParentCodeForPatientHomeBlock("subscription_carousel")).toBeUndefined();
  });

  it("taxonomyFromPlacement and placementFromTaxonomy roundtrip known values", () => {
    expect(taxonomyFromPlacement("article")).toEqual({ kind: "article", systemParentCode: null });
    expect(taxonomyFromPlacement("warmups")).toEqual({ kind: "system", systemParentCode: "warmups" });
    expect(taxonomyFromPlacement("system_root")).toEqual({ kind: "system", systemParentCode: null });
    expect(taxonomyFromPlacement("bad")).toBeNull();

    expect(placementFromTaxonomy("article", null)).toBe("article");
    expect(placementFromTaxonomy("system", "lessons")).toBe("lessons");
    expect(placementFromTaxonomy("system", null)).toBe("system_root");
  });
});
