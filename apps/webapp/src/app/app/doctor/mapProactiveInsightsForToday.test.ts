import { describe, expect, it } from "vitest";
import { mapProactiveInsightsForToday, proactiveInsightHref } from "./mapProactiveInsightsForToday";

describe("proactiveInsightHref", () => {
  it("links wellbeing streak to the new patient card", () => {
    expect(
      proactiveInsightHref({
        kind: "wellbeing_low_streak",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe("/app/doctor/patients/u1");
  });

  it("links program inactivity to the new patient card when instance present", () => {
    expect(
      proactiveInsightHref({
        kind: "program_inactivity",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
        activeProgramInstanceId: "inst-9",
      }),
    ).toBe("/app/doctor/patients/u1");
  });

  it("links program inactivity to the new patient card without instance id", () => {
    expect(
      proactiveInsightHref({
        kind: "program_inactivity",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe("/app/doctor/patients/u1");
  });
});

describe("mapProactiveInsightsForToday", () => {
  it("maps rows with patient-card href", () => {
    const rows = mapProactiveInsightsForToday([
      {
        kind: "wellbeing_low_streak",
        patientUserId: "p1",
        patientDisplayName: "Maria",
        summary: "low",
        sortAt: "2026-06-02T00:00:00.000Z",
      },
    ]);
    expect(rows[0]?.href).toBe("/app/doctor/patients/p1");
  });
});
