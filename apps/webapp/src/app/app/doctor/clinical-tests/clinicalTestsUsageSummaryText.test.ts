import { describe, expect, it } from "vitest";
import { clinicalTestUsageHasAnyReference, clinicalTestUsageSections } from "./clinicalTestsUsageSummaryText";
import { EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT } from "@/modules/tests/types";

describe("clinicalTestUsageSummaryText", () => {
  it("clinicalTestUsageHasAnyReference is false for empty snapshot", () => {
    expect(clinicalTestUsageHasAnyReference({ ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT })).toBe(false);
  });

  it("includes archived_tp_tpl section when archived template counter positive", () => {
    const sections = clinicalTestUsageSections({
      ...EMPTY_CLINICAL_TEST_USAGE_SNAPSHOT,
      archivedTreatmentProgramTemplateCount: 1,
      archivedTreatmentProgramTemplateRefs: [{ kind: "treatment_program_template", id: "x", title: "T" }],
    });
    expect(sections.some((s) => s.key === "archived_tp_tpl")).toBe(true);
  });
});
