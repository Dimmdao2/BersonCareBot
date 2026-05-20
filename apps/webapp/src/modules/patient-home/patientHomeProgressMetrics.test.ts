import { describe, expect, it } from "vitest";
import {
  countTrainingSessionsFromDoneTimestamps,
  countWarmupDoneToday,
  buildPatientHomeProgressDisplay,
} from "./patientHomeProgressMetrics";

describe("patientHomeProgressMetrics", () => {
  it("counts only daily_warmup completions", () => {
    expect(
      countWarmupDoneToday([
        {
          id: "1",
          userId: "u",
          contentPageId: "p",
          source: "daily_warmup",
          completedAt: "2026-05-20T10:00:00.000Z",
          feeling: null,
          notes: "",
        },
        {
          id: "2",
          userId: "u",
          contentPageId: "p2",
          source: "reminder",
          completedAt: "2026-05-20T11:00:00.000Z",
          feeling: null,
          notes: "",
        },
      ]),
    ).toBe(1);
  });

  it("groups program marks within 100 minutes as one session", () => {
    const t0 = "2026-05-20T10:00:00.000Z";
    const t1 = "2026-05-20T10:30:00.000Z";
    const t2 = "2026-05-20T12:00:00.000Z";
    expect(countTrainingSessionsFromDoneTimestamps([t0, t1])).toBe(1);
    expect(countTrainingSessionsFromDoneTimestamps([t0, t1, t2])).toBe(2);
  });

  it("buildPatientHomeProgressDisplay sums planned and done", () => {
    expect(
      buildPatientHomeProgressDisplay({
        warmupPlanned: 2,
        warmupDone: 1,
        trainingPlanned: 1,
        trainingDone: 1,
        streakDays: 3,
      }),
    ).toMatchObject({ doneTotal: 2, plannedTotal: 3, streakDays: 3 });
  });
});
