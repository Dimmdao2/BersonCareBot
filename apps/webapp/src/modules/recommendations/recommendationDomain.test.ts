import { describe, expect, it } from "vitest";
import { parseRecommendationDomain, RECOMMENDATION_DOMAIN_CODES } from "./recommendationDomain";

describe("recommendationDomain", () => {
  it("parses B4 extended type codes", () => {
    expect(parseRecommendationDomain("regimen")).toBe("regimen");
    expect(parseRecommendationDomain("device")).toBe("device");
    expect(parseRecommendationDomain("lifestyle")).toBe("lifestyle");
  });

  it("rejects unknown domain strings", () => {
    expect(parseRecommendationDomain("not_a_real_code")).toBeUndefined();
  });

  it("keeps legacy codes in the allowlist", () => {
    for (const code of ["exercise_technique", "daily_activity", "nutrition", "physiotherapy"] as const) {
      expect(RECOMMENDATION_DOMAIN_CODES).toContain(code);
      expect(parseRecommendationDomain(code)).toBe(code);
    }
  });
});
