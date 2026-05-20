import { describe, expect, it } from "vitest";
import {
  aggregatePassageStatsFromSnapshots,
  hasPriorDiaryActivityBeforeInstance,
  snapshotDayHasPlanOrWarmupActivity,
} from "./aggregatePassageStatsFromSnapshots";
import type { PatientDiaryDaySnapshotRow } from "../../../db/schema/patientDiarySnapshots";

function snap(partial: Partial<PatientDiaryDaySnapshotRow> & { localDate: string }): PatientDiaryDaySnapshotRow {
  return {
    platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    iana: "UTC",
    warmupSlotLimit: 3,
    warmupDoneCount: 0,
    warmupAllDone: false,
    planInstanceId: null,
    planItemIds: [],
    planDoneMask: [],
    capturedAt: "2026-05-01T00:00:00.000Z",
    ...partial,
  };
}

describe("aggregatePassageStatsFromSnapshots", () => {
  it("counts activity days from snapshots and log supplement", () => {
    const snapshots = [
      snap({ localDate: "2026-05-10", planItemIds: ["a"], planDoneMask: [true] }),
      snap({ localDate: "2026-05-11", planItemIds: ["b"], planDoneMask: [false] }),
    ];
    const result = aggregatePassageStatsFromSnapshots({
      snapshots,
      calendarDaysInWindow: 5,
      windowStartLocalYmd: "2026-05-10",
      windowEndLocalYmdInclusive: "2026-05-14",
      logActivityLocalDates: new Set(["2026-05-12"]),
    });
    expect(result.daysWithActivity).toBe(2);
    expect(result.missedDays).toBe(3);
    expect(result.avgCompletionsPerDay).toBe(0.2);
  });

  it("hasPriorDiaryActivityBeforeInstance detects earlier snapshot activity", () => {
    const snapshots = [snap({ localDate: "2026-05-08", planDoneMask: [true], planItemIds: ["x"] })];
    expect(
      hasPriorDiaryActivityBeforeInstance(snapshots, "2026-05-10T00:00:00.000Z", "UTC"),
    ).toBe(true);
    expect(snapshotDayHasPlanOrWarmupActivity(snapshots[0]!)).toBe(true);
  });
});
