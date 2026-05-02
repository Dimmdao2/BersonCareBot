import { describe, expect, it } from "vitest";
import { doctorExerciseUsageHref } from "./exerciseUsageDocLinks";

describe("doctorExerciseUsageHref", () => {
  it("builds doctor URLs for usage ref kinds", () => {
    expect(doctorExerciseUsageHref({ kind: "lfk_complex_template", id: "t1", title: "x" })).toBe(
      "/app/doctor/lfk-templates/t1",
    );
    expect(doctorExerciseUsageHref({ kind: "treatment_program_template", id: "p1", title: "x" })).toBe(
      "/app/doctor/treatment-program-templates/p1",
    );
    expect(
      doctorExerciseUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
    expect(
      doctorExerciseUsageHref({
        kind: "patient_lfk_assignment_client",
        id: "a1",
        title: "x",
        patientUserId: "u2",
      }),
    ).toBe("/app/doctor/clients/u2");
  });
});
