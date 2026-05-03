import { beforeAll, describe, expect, it } from "vitest";
import { inMemoryReferencesPort } from "@/infra/repos/inMemoryReferences";
import {
  parseRecommendationDomain,
  RECOMMENDATION_TYPE_CATEGORY_CODE,
  RECOMMENDATION_TYPE_SEED_V1,
} from "./recommendationDomain";
import type { ReferenceItem } from "@/modules/references/types";

let refItems: ReferenceItem[];

beforeAll(async () => {
  refItems = await inMemoryReferencesPort.listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE);
});

describe("recommendationDomain", () => {
  it("parses B4 extended type codes against reference allowlist", () => {
    expect(parseRecommendationDomain("regimen", refItems)).toBe("regimen");
    expect(parseRecommendationDomain("device", refItems)).toBe("device");
    expect(parseRecommendationDomain("lifestyle", refItems)).toBe("lifestyle");
  });

  it("rejects unknown domain strings", () => {
    expect(parseRecommendationDomain("not_a_real_code", refItems)).toBeUndefined();
  });

  it("keeps legacy codes in the seed v1 set", () => {
    for (const code of ["exercise_technique", "daily_activity", "nutrition", "physiotherapy"] as const) {
      expect(RECOMMENDATION_TYPE_SEED_V1.some((x) => x.code === code)).toBe(true);
      expect(parseRecommendationDomain(code, refItems)).toBe(code);
    }
  });
});
