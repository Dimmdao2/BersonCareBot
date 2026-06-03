import { describe, expect, it } from "vitest";
import { doctorClientProfileHref } from "./doctorClientProfileHref";
import { doctorClientTreatmentProgramInstanceHref } from "./doctorClientInstanceHref";

describe("doctorClientTreatmentProgramInstanceHref", () => {
  it("includes focusItemId query param", () => {
    const href = doctorClientTreatmentProgramInstanceHref("user-1", "inst-1", {
      focusItemId: "result-abc",
      profileListScope: "all",
    });
    expect(href).toBe(
      "/app/doctor/clients/user-1/treatment-programs/inst-1?scope=all&focusItemId=result-abc",
    );
  });
});

describe("doctorClientProfileHref", () => {
  it("normalizes unknown profile scope and preserves pending attempt focus", () => {
    expect(
      doctorClientProfileHref("user-1", {
        profileListScope: "unknown",
        pendingAttemptId: "attempt-1",
        hash: "doctor-client-section-pending-program-tests",
      }),
    ).toBe(
      "/app/doctor/clients/user-1?scope=appointments&pendingAttempt=attempt-1#doctor-client-section-pending-program-tests",
    );
  });
});
