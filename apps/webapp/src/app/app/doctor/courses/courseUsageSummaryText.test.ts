import { describe, expect, it } from "vitest";
import { EMPTY_COURSE_USAGE_SNAPSHOT } from "@/modules/courses/types";
import { courseUsageHasSecondaryReferences, courseUsageSections } from "./courseUsageSummaryText";

describe("courseUsageSummaryText", () => {
  it("courseUsageHasSecondaryReferences is false when only template ref would exist", () => {
    const u = {
      ...EMPTY_COURSE_USAGE_SNAPSHOT,
      programTemplateId: "t1",
      programTemplateRef: { kind: "treatment_program_template" as const, id: "t1", title: "T" },
    };
    expect(courseUsageHasSecondaryReferences(u)).toBe(false);
  });

  it("courseUsageSections includes template and instance groups", () => {
    const u = {
      ...EMPTY_COURSE_USAGE_SNAPSHOT,
      programTemplateId: "t1",
      programTemplateRef: { kind: "treatment_program_template" as const, id: "t1", title: "T" },
      activeTreatmentProgramInstanceCount: 1,
      activeTreatmentProgramInstanceRefs: [
        {
          kind: "treatment_program_instance" as const,
          id: "i1",
          title: "Программа",
          patientUserId: "u1",
        },
      ],
      publishedLinkedContentPageCount: 1,
      publishedLinkedContentPageRefs: [{ kind: "content_page" as const, id: "p1", title: "Промо" }],
    };
    expect(courseUsageHasSecondaryReferences(u)).toBe(true);
    const keys = courseUsageSections(u).map((s) => s.key);
    expect(keys).toEqual(["tpl", "active_inst", "pub_page"]);
  });
});
