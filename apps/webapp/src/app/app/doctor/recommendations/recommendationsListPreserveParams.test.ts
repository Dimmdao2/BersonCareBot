import { describe, expect, it } from "vitest";
import {
  appendRecommendationsCatalogFiltersToSearchParams,
  appendRecommendationsListPreserveToSearchParams,
} from "./recommendationsListPreserveParams";

describe("appendRecommendationsListPreserveToSearchParams", () => {
  it("preserves q, titleSort, region, domain, status", () => {
    const sp = new URLSearchParams();
    sp.set("selected", "rec-1");
    sp.set("view", "list");
    const fd = new FormData();
    fd.set("listQ", "  foo  ");
    fd.set("listTitleSort", "asc");
    fd.set("listRegion", "spine");
    fd.set("listDomain", "nutrition");
    fd.set("listStatus", "archived");
    appendRecommendationsListPreserveToSearchParams(sp, fd);
    expect(sp.get("selected")).toBe("rec-1");
    expect(sp.get("view")).toBe("list");
    expect(sp.get("q")).toBe("foo");
    expect(sp.get("titleSort")).toBe("asc");
    expect(sp.get("region")).toBe("spine");
    expect(sp.get("domain")).toBe("nutrition");
    expect(sp.get("status")).toBe("archived");
    expect(sp.has("regionRefId")).toBe(false);
  });

  it("does not set region for UUID listRegion", () => {
    const sp = new URLSearchParams();
    const fd = new FormData();
    fd.set("listRegion", "550e8400-e29b-41d4-a716-446655440000");
    appendRecommendationsListPreserveToSearchParams(sp, fd);
    expect(sp.has("region")).toBe(false);
  });
});

describe("appendRecommendationsCatalogFiltersToSearchParams", () => {
  it("maps preserve object to catalog query", () => {
    const sp = new URLSearchParams();
    appendRecommendationsCatalogFiltersToSearchParams(sp, {
      q: " knee ",
      titleSort: "desc",
      regionCode: "knee",
      domain: "mobility",
      listStatus: "archived",
    });
    expect(sp.get("q")).toBe("knee");
    expect(sp.get("titleSort")).toBe("desc");
    expect(sp.get("region")).toBe("knee");
    expect(sp.get("domain")).toBe("mobility");
    expect(sp.get("status")).toBe("archived");
  });
});
