import type { PendingProgramTestEvaluationGlobalRow } from "@/modules/treatment-program/types";
import { groupPendingProgramTestEvaluations } from "./clients/groupPendingProgramTestEvaluations";
import { doctorClientTreatmentProgramInstanceHref } from "./clients/doctorClientInstanceHref";
import { formatDateTimeRu } from "./loadDoctorTodayDashboard";

export const DOCTOR_TODAY_PENDING_TESTS_PREVIEW_LIMIT = 10;

export type TodayPendingProgramTestItem = {
  attemptId: string;
  patientUserId: string;
  patientDisplayName: string;
  instanceId: string;
  instanceTitle: string;
  stageTitle: string;
  pendingCount: number;
  submittedAtLabel: string;
  href: string;
};

export function mapPendingProgramTestsForToday(
  rows: readonly PendingProgramTestEvaluationGlobalRow[],
): TodayPendingProgramTestItem[] {
  const attemptOrder: string[] = [];
  for (const row of rows) {
    if (!attemptOrder.includes(row.attemptId)) attemptOrder.push(row.attemptId);
  }

  const groups = groupPendingProgramTestEvaluations(rows).sort((a, b) => {
    const ia = attemptOrder.indexOf(a.attemptId);
    const ib = attemptOrder.indexOf(b.attemptId);
    if (ia !== -1 && ib !== -1 && ia !== ib) return ia - ib;
    return b.attemptSubmittedAt.localeCompare(a.attemptSubmittedAt);
  });

  return groups.map((g) => {
    const headGlobal = rows.find((r) => r.attemptId === g.attemptId);
    const patientUserId = headGlobal?.patientUserId ?? "";
    const focusResultId = g.results[0]?.resultId;
    return {
      attemptId: g.attemptId,
      patientUserId,
      patientDisplayName: headGlobal?.patientDisplayName.trim() || "—",
      instanceId: g.instanceId,
      instanceTitle: g.instanceTitle,
      stageTitle: g.stageTitle,
      pendingCount: g.results.length,
      submittedAtLabel: formatDateTimeRu(g.attemptSubmittedAt),
      href: doctorClientTreatmentProgramInstanceHref(patientUserId, g.instanceId, {
        focusItemId: focusResultId,
      }),
    };
  });
}
