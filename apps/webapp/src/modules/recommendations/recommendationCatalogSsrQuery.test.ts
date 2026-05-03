import { beforeAll, describe, expect, it } from "vitest";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import { RECOMMENDATION_TYPE_CATEGORY_CODE } from "./recommendationDomain";
import { parseRecommendationCatalogSsrQuery } from "./recommendationCatalogSsrQuery";
import type { ReferenceItem } from "@/modules/references/types";

let refItems: ReferenceItem[];

beforeAll(async () => {
  refItems = await inMemoryReferencesPort.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
});

describe("parseRecommendationCatalogSsrQuery", () => {
  it("applies valid domain and region", () => {
    const r = parseRecommendationCatalogSsrQuery(
      {
        domain: "nutrition",
        region: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
      refItems,
    );
    expect(r.invalidDomainQuery).toBe(false);
    expect(r.invalidRegionQuery).toBe(false);
    expect(r.domainForList).toBe("nutrition");
    expect(r.regionRefIdForList).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("drops invalid domain and sets invalidDomainQuery", () => {
    const r = parseRecommendationCatalogSsrQuery({ domain: "not-a-code" }, refItems);
    expect(r.invalidDomainQuery).toBe(true);
    expect(r.domainForList).toBe(null);
  });

  it("drops invalid region and sets invalidRegionQuery", () => {
    const r = parseRecommendationCatalogSsrQuery({ region: "not-a-uuid" }, refItems);
    expect(r.invalidRegionQuery).toBe(true);
    expect(r.regionRefIdForList).toBe(null);
  });

  it("treats empty strings as no filter", () => {
    const r = parseRecommendationCatalogSsrQuery({ domain: "   ", region: "" }, refItems);
    expect(r.invalidDomainQuery).toBe(false);
    expect(r.invalidRegionQuery).toBe(false);
    expect(r.domainForList).toBe(null);
    expect(r.regionRefIdForList).toBe(null);
  });
});
