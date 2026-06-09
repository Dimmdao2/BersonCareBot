import type { OperatorIncidentDigestRow, OperatorJobFailureDigestRow } from "./digestPorts";

export const OPERATOR_HEALTH_DIGEST_LINK = "/app/doctor/system-health";
export const MAX_OPERATOR_HEALTH_DIGEST_LINES = 15;

export type OperatorHealthDigestInput = {
  auditErrorCount: number;
  incidentsOpened: OperatorIncidentDigestRow[];
  incidentsResolved: OperatorIncidentDigestRow[];
  jobFailures: OperatorJobFailureDigestRow[];
  /** Текущий health-snapshot: ongoing critical + non-critical degraded. */
  snapshotLines: string[];
  /** true после ручного resolve-all в окне — без строк recovery. */
  suppressRecovery: boolean;
};

export type OperatorHealthDigestResult = {
  lines: string[];
  hasIssues: boolean;
  icon: "⚠️" | "✅";
};

export function buildOperatorHealthDigest(input: OperatorHealthDigestInput): OperatorHealthDigestResult {
  const detailLines: string[] = [];

  if (input.auditErrorCount > 0) {
    detailLines.push(`Ошибки в журнале админки: ${input.auditErrorCount}`);
  }

  for (const inc of input.incidentsOpened.slice(0, 3)) {
    detailLines.push(`Инцидент: ${inc.integration} / ${inc.errorClass}`);
  }
  if (input.incidentsOpened.length > 3) {
    detailLines.push(`…и ещё ${input.incidentsOpened.length - 3} инцидентов`);
  }

  detailLines.push(...input.snapshotLines);

  if (!input.suppressRecovery && input.incidentsResolved.length > 0) {
    detailLines.push("Восстановлено за окно:");
    for (const inc of input.incidentsResolved.slice(0, 2)) {
      detailLines.push(`${inc.integration} / ${inc.errorClass}`);
    }
    if (input.incidentsResolved.length > 2) {
      detailLines.push(`…и ещё ${input.incidentsResolved.length - 2} восстановлений`);
    }
  }

  for (const job of input.jobFailures.slice(0, 2)) {
    detailLines.push(`Сбой задачи: ${job.jobKey}`);
  }
  if (input.jobFailures.length > 2) {
    detailLines.push(`…и ещё ${input.jobFailures.length - 2} сбоев задач`);
  }

  const hasIssues = detailLines.length > 0;
  const icon = hasIssues ? "⚠️" : "✅";
  const header = hasIssues ? "⚠️ Сводка здоровья системы" : "✅ Всё в порядке";

  const lines = [header];
  if (hasIssues) {
    const budget = MAX_OPERATOR_HEALTH_DIGEST_LINES - 2;
    lines.push(...detailLines.slice(0, Math.max(0, budget)));
  }
  lines.push(OPERATOR_HEALTH_DIGEST_LINK);

  return { lines, hasIssues, icon };
}
