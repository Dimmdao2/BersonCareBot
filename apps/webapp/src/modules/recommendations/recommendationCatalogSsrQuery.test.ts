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
  it("applies valid domain and passes region code for client (not server refId)", () => {
    const r = parseRecommendationCatalogSsrQuery(
      {
        domain: "nutrition",
        region: "spine",
      },
      refItems,
    );
    expect(r.invalidDomainQuery).toBe(false);
    expect(r.invalidRegionQuery).toBe(false);
    expect(r.domainForList).toBe("nutrition");
    expect(r.regionCodeForCatalog).toBe("spine");
  });

  it("drops invalid domain and sets invalidDomainQuery", () => {
    const r = parseRecommendationCatalogSsrQuery({ domain: "not-a-code" }, refItems);
    expect(r.invalidDomainQuery).toBe(true);
    expect(r.domainForList).toBe(null);
  });

  it("treats UUID region as invalid for catalog URL contract", () => {
    const r = parseRecommendationCatalogSsrQuery(
      { region: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      refItems,
    );
    expect(r.invalidRegionQuery).toBe(true);
    expect(r.regionCodeForCatalog).toBeUndefined();
  });

  it("treats empty strings as no filter", () => {
    const r = parseRecommendationCatalogSsrQuery({ domain: "   ", region: "" }, refItems);
    expect(r.invalidDomainQuery).toBe(false);
    expect(r.invalidRegionQuery).toBe(false);
    expect(r.domainForList).toBe(null);
    expect(r.regionCodeForCatalog).toBeUndefined();
  });
});
