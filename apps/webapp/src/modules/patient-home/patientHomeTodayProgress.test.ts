import { describe, expect, it } from "vitest";
import {
  buildPatientHomeProgressGoalBreakdown,
  computePatientHomeTodayDoneCount,
  countProgramChecklistItemsDoneToday,
  countWarmupCompletionsInRows,
} from "./patientHomeTodayProgress";

describe("patientHomeTodayProgress", () => {
  it("counts warmup completions by source", () => {
    const n = countWarmupCompletionsInRows([
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
        source: "section_page",
        completedAt: "2026-05-20T11:00:00.000Z",
        feeling: null,
        notes: "",
      },
    ]);
    expect(n).toBe(1);
  });

  it("sums warmup and program checklist for today done", () => {
    expect(
      computePatientHomeTodayDoneCount({
        warmupCompletionsToday: 2,
        programChecklistDoneToday: 1,
      }),
    ).toBe(3);
  });

  it("builds breakdown with capped lfk done", () => {
    expect(
      buildPatientHomeProgressGoalBreakdown({
        warmupDone: 1,
        warmupPlanned: 2,
        programDone: 3,
        lfkPlanned: 2,
      }),
    ).toEqual({ warmupDone: 1, warmupPlanned: 2, lfkDone: 2, lfkPlanned: 2 });
  });

  it("countProgramChecklistItemsDoneToday uses doneItemIds length", () => {
    expect(
      countProgramChecklistItemsDoneToday({
        doneItemIds: ["a", "b"],
        doneTodayCountByItemId: {},
        lastDoneAtIsoByItemId: {},
        totalCompletionEventsByItemId: {},
        doneTodayCountByActivityKey: {},
        lastDoneAtIsoByActivityKey: {},
      }),
    ).toBe(2);
  });
});
