import { describe, expect, it } from "vitest";
import {
  parseRecommendationListFilterScope,
  parseTemplateCourseCatalogListStatus,
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
