import type { PendingProgramTestEvaluationRow } from "@/modules/treatment-program/types";

export type PendingProgramTestEvaluationGroup = {
  attemptId: string;
  attemptSubmittedAt: string;
  instanceId: string;
  instanceTitle: string;
  stageTitle: string;
  stageItemId: string;
  results: PendingProgramTestEvaluationRow[];
};

/**
 * Строки из `listPendingEvaluationResultsForPatient` группируются по `attemptId`.
 * Группы — по дате отправки попытки (новее первыми); при равной дате — лексикографически больший `attemptId`.
 * Внутри группы — по `createdAt`, затем по `resultId`.
 */
export function groupPendingProgramTestEvaluations(
  rows: readonly PendingProgramTestEvaluationRow[],
): PendingProgramTestEvaluationGroup[] {
  const byAttempt = new Map<string, PendingProgramTestEvaluationRow[]>();
  for (const row of rows) {
    const list = byAttempt.get(row.attemptId);
    if (list) list.push(row);
    else byAttempt.set(row.attemptId, [row]);
  }

  const groups: PendingProgramTestEvaluationGroup[] = [];
  for (const [attemptId, results] of byAttempt) {
    const sortedResults = [...results].sort((a, b) => {
      const c = a.createdAt.localeCompare(b.createdAt);
      if (c !== 0) return c;
      return a.resultId.localeCompare(b.resultId);
    });
    const head = sortedResults[0]!;
    groups.push({
      attemptId,
      attemptSubmittedAt: head.attemptSubmittedAt,
      instanceId: head.instanceId,
      instanceTitle: head.instanceTitle,
      stageTitle: head.stageTitle,
      stageItemId: head.stageItemId,
      results: sortedResults,
    });
  }

  groups.sort((a, b) => {
    const d = b.attemptSubmittedAt.localeCompare(a.attemptSubmittedAt);
    if (d !== 0) return d;
    return b.attemptId.localeCompare(a.attemptId);
  });

  return groups;
}
