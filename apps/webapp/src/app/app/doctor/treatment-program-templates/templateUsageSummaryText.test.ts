import { describe, expect, it } from "vitest";
import { EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/treatment-program/types";
import { treatmentProgramTemplateUsageHasAnyReference, treatmentProgramTemplateUsageSections } from "./templateUsageSummaryText";

describe("treatmentProgramTemplateUsageSummaryText", () => {
  it("treatmentProgramTemplateUsageHasAnyReference is false for empty snapshot", () => {
    expect(treatmentProgramTemplateUsageHasAnyReference(EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT)).toBe(false);
  });

  it("treatmentProgramTemplateUsageSections lists groups with refs", () => {
    const u = {
      ...EMPTY_TREATMENT_PROGRAM_TEMPLATE_USAGE_SNAPSHOT,
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance" as const,
          id: "i1",
          title: "Prog",
          patientUserId: "u1",
        },
      ],
      publishedCourseCount: 1,
      publishedCourseRefs: [{ kind: "course" as const, id: "c1", title: "Course" }],
    };
    expect(treatmentProgramTemplateUsageHasAnyReference(u)).toBe(true);
    const sections = treatmentProgramTemplateUsageSections(u);
    expect(sections.map((s) => s.key)).toEqual(["active_inst", "pub_course"]);
    expect(sections[0]?.refs).toHaveLength(1);
    expect(sections[1]?.refs).toHaveLength(1);
  });
});
