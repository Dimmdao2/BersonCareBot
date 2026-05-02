import { describe, expect, it } from "vitest";
import { EMPTY_RECOMMENDATION_USAGE_SNAPSHOT } from "@/modules/recommendations/types";
import { recommendationUsageHasAnyReference, recommendationUsageSections } from "./recommendationUsageSummaryText";

describe("recommendationUsageSummaryText", () => {
  it("empty snapshot has no sections", () => {
    expect(recommendationUsageHasAnyReference(EMPTY_RECOMMENDATION_USAGE_SNAPSHOT)).toBe(false);
    expect(recommendationUsageSections(EMPTY_RECOMMENDATION_USAGE_SNAPSHOT)).toEqual([]);
  });

  it("groups published templates", () => {
    const u = {
      ...EMPTY_RECOMMENDATION_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 2,
      publishedTreatmentProgramTemplateRefs: [
        { kind: "treatment_program_template" as const, id: "a", title: "A" },
      ],
    };
    expect(recommendationUsageHasAnyReference(u)).toBe(true);
    const sec = recommendationUsageSections(u);
    expect(sec).toHaveLength(1);
    expect(sec[0]?.key).toBe("published_tp_tpl");
    expect(sec[0]?.refs).toHaveLength(1);
  });
});
