import { describe, expect, it } from "vitest";
import { doctorTreatmentProgramTemplateUsageHref } from "./templateUsageDocLinks";

describe("doctorTreatmentProgramTemplateUsageHref", () => {
  it("builds doctor URLs for usage ref kinds", () => {
    expect(
      doctorTreatmentProgramTemplateUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
    expect(
      doctorTreatmentProgramTemplateUsageHref({ kind: "course", id: "c1", title: "Курс" }),
    ).toBe("/app/doctor/courses/c1");
  });
});
