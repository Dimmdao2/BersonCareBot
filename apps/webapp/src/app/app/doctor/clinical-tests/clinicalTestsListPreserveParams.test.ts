import { describe, expect, it } from "vitest";
import { appendClinicalTestsListPreserveToSearchParams } from "./clinicalTestsListPreserveParams";

describe("appendClinicalTestsListPreserveToSearchParams", () => {
  it("preserves q, titleSort, region, load, assessment, status", () => {
    const sp = new URLSearchParams();
    sp.set("selected", "test-1");
    sp.set("view", "tiles");
    const fd = new FormData();
    fd.set("listQ", "  bar  ");
    fd.set("listTitleSort", "desc");
    fd.set("listRegion", "spine");
    fd.set("listLoad", "strength");
    fd.set("listAssessment", "knee");
    fd.set("listStatus", "active");
    appendClinicalTestsListPreserveToSearchParams(sp, fd);
    expect(sp.get("selected")).toBe("test-1");
    expect(sp.get("view")).toBe("tiles");
    expect(sp.get("q")).toBe("bar");
    expect(sp.get("titleSort")).toBe("desc");
    expect(sp.get("region")).toBe("spine");
    expect(sp.get("load")).toBe("strength");
    expect(sp.get("assessment")).toBe("knee");
    expect(sp.get("status")).toBe("active");
    expect(sp.has("regionRefId")).toBe(false);
  });

  it("does not set region for UUID listRegion", () => {
    const sp = new URLSearchParams();
    const fd = new FormData();
    fd.set("listRegion", "550e8400-e29b-41d4-a716-446655440000");
    appendClinicalTestsListPreserveToSearchParams(sp, fd);
    expect(sp.has("region")).toBe(false);
  });
});
