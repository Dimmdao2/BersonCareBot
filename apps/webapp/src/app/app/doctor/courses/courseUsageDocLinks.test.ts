import { describe, expect, it } from "vitest";
import { doctorCourseUsageHref } from "./courseUsageDocLinks";

describe("doctorCourseUsageHref", () => {
  it("builds doctor URLs for course usage ref kinds", () => {
    expect(
      doctorCourseUsageHref({ kind: "treatment_program_template", id: "t1", title: "x" }),
    ).toBe("/app/doctor/treatment-program-templates/t1");
    expect(
      doctorCourseUsageHref({
        kind: "treatment_program_instance",
        id: "i1",
        title: "x",
        patientUserId: "u1",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/i1");
    expect(doctorCourseUsageHref({ kind: "content_page", id: "p1", title: "Страница" })).toBe(
      "/app/doctor/content/edit/p1",
    );
  });
});
