import { describe, expect, it } from "vitest";
import { doctorRecommendationUsageHref } from "./recommendationUsageDocLinks";

describe("doctorRecommendationUsageHref", () => {
  it("builds template and instance hrefs", () => {
    expect(
      doctorRecommendationUsageHref({ kind: "treatment_program_template", id: "p1", title: "x" }),
    ).toBe("/app/doctor/treatment-program-templates/p1");
    expect(
      doctorRecommendationUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "y",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
  });
});
