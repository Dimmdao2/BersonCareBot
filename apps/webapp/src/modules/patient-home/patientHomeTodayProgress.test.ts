import { describe, expect, it } from "vitest";
import {
  assemblePatientHomeProgress,
  buildPatientHomeProgressAriaLabel,
  buildPatientHomeProgressGoalBreakdown,
  computePatientHomeTodayDoneCount,
  countPatientHomeDoneTowardReminderPlan,
  countProgramChecklistItemsDoneToday,
  countWarmupCompletionsInRows,
  resolvePatientHomePracticeTarget,
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

  it("does not count legacy reminder source as warmup", () => {
    const n = countWarmupCompletionsInRows([
      {
        id: "1",
        userId: "u",
        contentPageId: "p",
        source: "reminder",
        completedAt: "2026-05-20T10:00:00.000Z",
        feeling: null,
        notes: "",
      },
    ]);
    expect(n).toBe(0);
  });

  it("resolvePatientHomePracticeTarget uses admin target without reminders", () => {
    expect(
      resolvePatientHomePracticeTarget({
        muted: false,
        hasConfiguredHomeLinkedReminders: false,
        plannedTotal: 0,
        adminPracticeTarget: 3,
      }),
    ).toBe(3);
  });

  it("buildPatientHomeProgressAriaLabel uses displayDone", () => {
    expect(
      buildPatientHomeProgressAriaLabel({
        displayDone: 3,
        practiceTarget: 5,
        showGoal: true,
        breakdown: { warmupDone: 4, warmupPlanned: 2, lfkDone: 0, lfkPlanned: 2 },
      }),
    ).toBe("Выполнено сегодня: 3 из 5. Разминки: 4 из 2. Тренировки: 0 из 2.");
  });

  it("sums warmup and program checklist for today done", () => {
    expect(
      computePatientHomeTodayDoneCount({
        warmupCompletionsToday: 2,
        programChecklistDoneToday: 1,
      }),
    ).toBe(3);
  });

  it("builds breakdown from capped slot counts", () => {
    expect(
      buildPatientHomeProgressGoalBreakdown({
        warmupDone: 1,
        warmupPlanned: 2,
        lfkDone: 2,
        lfkPlanned: 2,
      }),
    ).toEqual({ warmupDone: 1, warmupPlanned: 2, lfkDone: 2, lfkPlanned: 2 });
  });

  it("reminder plan todayDone matches breakdown sum (no extra checklist beyond slots)", () => {
    expect(
      countPatientHomeDoneTowardReminderPlan({
        warmupDoneToday: 1,
        programDoneToday: 2,
        warmupPlanned: 2,
        lfkPlanned: 1,
      }),
    ).toEqual({ warmupDone: 1, lfkDone: 1, todayDone: 2 });
    const assembled = assemblePatientHomeProgress({
      practiceTarget: 3,
      warmupDoneToday: 1,
      programDoneToday: 2,
      warmupPlanned: 2,
      lfkPlanned: 1,
      hasConfiguredSchedule: true,
      muted: false,
      plannedTotal: 3,
    });
    expect(assembled.todayDone).toBe(2);
    expect(assembled.goalBreakdown).toEqual({
      warmupDone: 1,
      warmupPlanned: 2,
      lfkDone: 1,
      lfkPlanned: 1,
    });
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
