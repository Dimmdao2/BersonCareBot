import { describe, expect, it } from "vitest";
import { doctorLfkTemplateUsageHref } from "./lfkTemplatesUsageDocLinks";

describe("doctorLfkTemplateUsageHref", () => {
  it("maps ref kinds to doctor routes", () => {
    expect(doctorLfkTemplateUsageHref({ kind: "treatment_program_template", id: "p1", title: "x" })).toBe(
      "/app/doctor/treatment-program-templates/p1",
    );
    expect(
      doctorLfkTemplateUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
    expect(
      doctorLfkTemplateUsageHref({
        kind: "patient_lfk_assignment_client",
        id: "a1",
        title: "x",
        patientUserId: "u2",
      }),
    ).toBe("/app/doctor/clients/u2");
  });
});
