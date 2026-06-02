import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  detectProgramInactivityInsights,
  detectWellbeingLowStreakInsights,
  mergeProactiveInsights,
} from "./computeProactiveInsights";

const IANA = "Europe/Moscow";
const PATIENT = { patientUserId: "p1", displayName: "Мария" };

describe("detectWellbeingLowStreakInsights", () => {
  const now = DateTime.fromISO("2026-06-02T12:00:00", { zone: IANA });

  it("returns streak when last 3 days all have low wellbeing", () => {
    const entries = [
      { patientUserId: "p1", recordedAt: "2026-06-02T10:00:00.000Z", value: 2, notes: null },
      { patientUserId: "p1", recordedAt: "2026-06-01T10:00:00.000Z", value: 1, notes: null },
      { patientUserId: "p1", recordedAt: "2026-05-31T10:00:00.000Z", value: 2, notes: null },
    ];
    const rows = detectWellbeingLowStreakInsights({
      patients: [PATIENT],
      entries,
      iana: IANA,
      now,
      streakDays: 3,
      maxLowValue: 2,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("wellbeing_low_streak");
    expect(rows[0]?.summary).toContain("3 дн.");
  });

  it("skips mirror wellbeing notes", () => {
    const entries = [
      { patientUserId: "p1", recordedAt: "2026-06-02T10:00:00.000Z", value: 1, notes: "__bcc_warmup_general_mirror__" },
      { patientUserId: "p1", recordedAt: "2026-06-01T10:00:00.000Z", value: 2, notes: null },
      { patientUserId: "p1", recordedAt: "2026-05-31T10:00:00.000Z", value: 2, notes: null },
    ];
    const rows = detectWellbeingLowStreakInsights({
      patients: [PATIENT],
      entries,
      iana: IANA,
      now,
    });
    expect(rows).toHaveLength(0);
  });

  it("does not alert when one day is missing entries", () => {
    const entries = [
      { patientUserId: "p1", recordedAt: "2026-06-02T10:00:00.000Z", value: 1, notes: null },
      { patientUserId: "p1", recordedAt: "2026-06-01T10:00:00.000Z", value: 2, notes: null },
    ];
    const rows = detectWellbeingLowStreakInsights({
      patients: [PATIENT],
      entries,
      iana: IANA,
      now,
    });
    expect(rows).toHaveLength(0);
  });

  it("returns streak when today has no entry but last 3 completed days are low", () => {
    const entries = [
      { patientUserId: "p1", recordedAt: "2026-06-01T10:00:00.000Z", value: 2, notes: null },
      { patientUserId: "p1", recordedAt: "2026-05-31T10:00:00.000Z", value: 1, notes: null },
      { patientUserId: "p1", recordedAt: "2026-05-30T10:00:00.000Z", value: 2, notes: null },
    ];
    const rows = detectWellbeingLowStreakInsights({
      patients: [PATIENT],
      entries,
      iana: IANA,
      now,
      streakDays: 3,
      maxLowValue: 2,
    });
    expect(rows).toHaveLength(1);
  });
});

describe("detectProgramInactivityInsights", () => {
  const now = DateTime.fromISO("2026-06-02T12:00:00.000Z");

  it("flags active doctor program with no done actions", () => {
    const rows = detectProgramInactivityInsights({
      patients: [PATIENT],
      activity: [
        {
          patientUserId: "p1",
          activeInstanceId: "inst-1",
          lastDoneAt: null,
          hasActiveDoctorProgram: true,
        },
      ],
      now,
      inactiveDays: 5,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("program_inactivity");
    expect(rows[0]?.activeProgramInstanceId).toBe("inst-1");
  });

  it("ignores patients without active doctor program", () => {
    const rows = detectProgramInactivityInsights({
      patients: [PATIENT],
      activity: [
        {
          patientUserId: "p1",
          activeInstanceId: null,
          lastDoneAt: null,
          hasActiveDoctorProgram: false,
        },
      ],
      now,
    });
    expect(rows).toHaveLength(0);
  });

  it("ignores recent program activity", () => {
    const rows = detectProgramInactivityInsights({
      patients: [PATIENT],
      activity: [
        {
          patientUserId: "p1",
          activeInstanceId: "inst-1",
          lastDoneAt: "2026-06-01T10:00:00.000Z",
          hasActiveDoctorProgram: true,
        },
      ],
      now,
      inactiveDays: 5,
    });
    expect(rows).toHaveLength(0);
  });
});

describe("mergeProactiveInsights", () => {
  it("dedupes by kind+patient and respects limit", () => {
    const a = {
      kind: "wellbeing_low_streak" as const,
      patientUserId: "p1",
      patientDisplayName: "A",
      summary: "s1",
      sortAt: "2026-06-02T00:00:00.000Z",
    };
    const b = { ...a, summary: "s2" };
    const c = {
      kind: "program_inactivity" as const,
      patientUserId: "p1",
      patientDisplayName: "A",
      summary: "s3",
      sortAt: "2026-06-01T00:00:00.000Z",
    };
    const merged = mergeProactiveInsights([[a, b], [c]], 2);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.kind)).toEqual(["wellbeing_low_streak", "program_inactivity"]);
  });
});
