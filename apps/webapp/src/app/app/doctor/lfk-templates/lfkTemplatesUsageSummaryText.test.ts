import { describe, expect, it } from "vitest";
import {
  lfkTemplateUsageHasAnyReference,
  lfkTemplateUsageSections,
} from "./lfkTemplatesUsageSummaryText";
import { EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT } from "@/modules/lfk-templates/types";

describe("lfkTemplateUsageSummaryText", () => {
  it("hasAnyReference is false for empty snapshot", () => {
    expect(lfkTemplateUsageHasAnyReference({ ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT })).toBe(false);
  });

  it("builds sections in stable order for mixed counts", () => {
    const u = {
      ...EMPTY_LFK_TEMPLATE_USAGE_SNAPSHOT,
      publishedTreatmentProgramTemplateCount: 1,
      draftTreatmentProgramTemplateCount: 1,
      activeTreatmentProgramInstanceCount: 1,
      activePatientLfkAssignmentCount: 1,
      completedTreatmentProgramInstanceCount: 1,
    };
    const keys = lfkTemplateUsageSections(u).map((s) => s.key);
    expect(keys).toEqual([
      "published_tp_tpl",
      "draft_tp_tpl",
      "active_tp_inst",
      "active_pla",
      "completed_tp_inst",
    ]);
  });
});
