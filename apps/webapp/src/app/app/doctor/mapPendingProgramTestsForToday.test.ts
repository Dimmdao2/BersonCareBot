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

  it("builds href to patient card pending tests section", () => {
    const [item] = mapPendingProgramTestsForToday(rows);
    expect(item?.patientDisplayName).toBe("Иванова");
    expect(item?.pendingCount).toBe(2);
    expect(item?.href).toBe("/app/doctor/patients/patient-1");
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
