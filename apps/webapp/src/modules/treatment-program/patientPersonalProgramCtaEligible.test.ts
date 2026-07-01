import { describe, expect, it } from "vitest";
import { patientPersonalProgramCtaShouldRenderOnPlanScreen } from "./patientPersonalProgramCtaEligible";

describe("patientPersonalProgramCtaShouldRenderOnPlanScreen", () => {
  it("hides CTA on active doctor program", () => {
    expect(
      patientPersonalProgramCtaShouldRenderOnPlanScreen({ status: "active", assignmentSource: "doctor" }),
    ).toBe(false);
  });

  it("shows CTA on active promo program", () => {
    expect(
      patientPersonalProgramCtaShouldRenderOnPlanScreen({ status: "active", assignmentSource: "promo" }),
    ).toBe(true);
  });

  it("shows CTA on completed doctor program", () => {
    expect(
      patientPersonalProgramCtaShouldRenderOnPlanScreen({ status: "completed", assignmentSource: "doctor" }),
    ).toBe(true);
  });

  it("hides CTA on completed promo program", () => {
    expect(
      patientPersonalProgramCtaShouldRenderOnPlanScreen({ status: "completed", assignmentSource: "promo" }),
    ).toBe(false);
  });
});
