import { describe, expect, it } from "vitest";
import { mapProactiveInsightsForToday, proactiveInsightHref } from "./mapProactiveInsightsForToday";

describe("proactiveInsightHref", () => {
  it("links wellbeing streak to wellbeing anchor", () => {
    expect(
      proactiveInsightHref({
        kind: "wellbeing_low_streak",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe("/app/doctor/clients/u1#doctor-client-section-wellbeing");
  });

  it("links program inactivity to active instance when present", () => {
    expect(
      proactiveInsightHref({
        kind: "program_inactivity",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
        activeProgramInstanceId: "inst-9",
      }),
    ).toBe("/app/doctor/clients/u1/treatment-programs/inst-9");
  });

  it("falls back to program section anchor without instance id", () => {
    expect(
      proactiveInsightHref({
        kind: "program_inactivity",
        patientUserId: "u1",
        patientDisplayName: "A",
        summary: "s",
        sortAt: "2026-06-02T00:00:00.000Z",
      }),
    ).toBe("/app/doctor/clients/u1#doctor-client-section-treatment-programs");
  });
});

describe("mapProactiveInsightsForToday", () => {
  it("maps rows with href", () => {
    const rows = mapProactiveInsightsForToday([
      {
        kind: "wellbeing_low_streak",
        patientUserId: "p1",
        patientDisplayName: "Maria",
        summary: "low",
        sortAt: "2026-06-02T00:00:00.000Z",
      },
    ]);
    expect(rows[0]?.href).toContain("#doctor-client-section-wellbeing");
  });
});
