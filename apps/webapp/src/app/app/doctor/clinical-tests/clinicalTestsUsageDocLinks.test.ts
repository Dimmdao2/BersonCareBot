import { describe, expect, it } from "vitest";
import { doctorClinicalTestUsageHref } from "./clinicalTestsUsageDocLinks";

describe("doctorClinicalTestUsageHref", () => {
  it("builds doctor URLs for clinical test usage ref kinds", () => {
    expect(doctorClinicalTestUsageHref({ kind: "test_set", id: "s1", title: "x" })).toBe("/app/doctor/test-sets/s1");
    expect(doctorClinicalTestUsageHref({ kind: "treatment_program_template", id: "p1", title: "x" })).toBe(
      "/app/doctor/treatment-program-templates/p1",
    );
    expect(
      doctorClinicalTestUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
  });
});
