import { describe, expect, it } from "vitest";
import type { PendingProgramTestEvaluationGlobalRow } from "@/modules/treatment-program/types";
import { mapPendingProgramTestsForToday } from "./mapPendingProgramTestsForToday";

describe("mapPendingProgramTestsForToday", () => {
  const rows: PendingProgramTestEvaluationGlobalRow[] = [
    {
      attemptId: "att-1",
      attemptSubmittedAt: "2026-06-02T10:00:00.000Z",
      resultId: "res-1",
      testId: "test-1",
      testTitle: "Тест A",
      createdAt: "2026-06-02T10:00:01.000Z",
      instanceId: "inst-1",
      instanceTitle: "Программа 1",
      stageTitle: "Этап 1",
      stageItemId: "item-1",
      patientUserId: "patient-1",
      patientDisplayName: "Иванова",
    },
    {
      attemptId: "att-1",
      attemptSubmittedAt: "2026-06-02T10:00:00.000Z",
      resultId: "res-2",
      testId: "test-2",
      testTitle: "Тест B",
      createdAt: "2026-06-02T10:00:02.000Z",
      instanceId: "inst-1",
      instanceTitle: "Программа 1",
      stageTitle: "Этап 1",
      stageItemId: "item-1",
      patientUserId: "patient-1",
      patientDisplayName: "Иванова",
    },
  ];

  it("builds href with focusItemId on first result in attempt group", () => {
    const [item] = mapPendingProgramTestsForToday(rows);
    expect(item?.patientDisplayName).toBe("Иванова");
    expect(item?.pendingCount).toBe(2);
    expect(item?.href).toContain("focusItemId=res-1");
    expect(item?.href).toContain("/app/doctor/clients/patient-1/treatment-programs/inst-1");
  });

  it("preserves attempt order from input rows (PG top-N order)", () => {
    const orderedRows: PendingProgramTestEvaluationGlobalRow[] = [
      {
        ...rows[0]!,
        attemptId: "att-newer",
        attemptSubmittedAt: "2026-06-02T12:00:00.000Z",
        resultId: "res-new",
        createdAt: "2026-06-02T12:00:01.000Z",
        patientDisplayName: "Новее",
      },
      {
        ...rows[0]!,
        attemptId: "att-older",
        attemptSubmittedAt: "2026-06-01T10:00:00.000Z",
        resultId: "res-old",
        createdAt: "2026-06-01T10:00:01.000Z",
        patientDisplayName: "Старее",
      },
    ];
    const mapped = mapPendingProgramTestsForToday(orderedRows);
    expect(mapped.map((x) => x.attemptId)).toEqual(["att-newer", "att-older"]);
  });
});
