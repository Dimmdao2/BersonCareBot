import { afterEach, describe, expect, it, vi } from "vitest";
import {
  patientPersonalProgramCtaEligible,
  patientPersonalProgramCtaShouldRender,
} from "@/modules/treatment-program/patientPersonalProgramCtaEligible";

describe("patientPersonalProgramCtaEligible", () => {
  it("eligibile for promo and course", () => {
    expect(patientPersonalProgramCtaEligible("promo")).toBe(true);
    expect(patientPersonalProgramCtaEligible("course")).toBe(true);
  });

  it("not for doctor-assigned program", () => {
    expect(patientPersonalProgramCtaEligible("doctor")).toBe(false);
  });
});

describe("patientPersonalProgramCtaShouldRender", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("follows eligibility in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(patientPersonalProgramCtaShouldRender("doctor")).toBe(false);
    expect(patientPersonalProgramCtaShouldRender("promo")).toBe(true);
    expect(patientPersonalProgramCtaShouldRender("course")).toBe(true);
  });

  it("shows for doctor-assigned programs when NODE_ENV is not production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(patientPersonalProgramCtaShouldRender("doctor")).toBe(true);
  });
});
