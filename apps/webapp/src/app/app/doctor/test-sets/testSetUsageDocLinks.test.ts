import { describe, expect, it } from "vitest";
import { doctorTestSetUsageHref } from "./testSetUsageDocLinks";

describe("doctorTestSetUsageHref", () => {
  it("builds doctor URLs for test set usage refs", () => {
    expect(doctorTestSetUsageHref({ kind: "treatment_program_template", id: "p1", title: "x" })).toBe(
      "/app/doctor/treatment-program-templates/p1",
    );
    expect(
      doctorTestSetUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
  });
});
