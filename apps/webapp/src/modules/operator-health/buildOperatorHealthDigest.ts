import type { OperatorIncidentDigestRow, OperatorJobFailureDigestRow } from './digestPorts';
import {
  buildDeliveryEvidenceLines,
  hasPositiveDeliveryEvidence,
  isOldestUnsentOverThreshold,
  type DeliveryEvidence,
} from './deliveryEvidence';
import { formatHeartbeatAge, isHeartbeatFailing, type OperatorHeartbeatVerdict } from './heartbeat';

export const OPERATOR_HEALTH_DIGEST_LINK = '/app/admin/system-health';
export const MAX_OPERATOR_HEALTH_DIGEST_LINES = 20;

export type OperatorHealthDigestInput = {
  auditErrorCount: number;
  incidentsOpened: OperatorIncidentDigestRow[];
  incidentsResolved: OperatorIncidentDigestRow[];
  jobFailures: OperatorJobFailureDigestRow[];
  /** Текущий health-snapshot: ongoing critical + non-critical degraded. */
  snapshotLines: string[];
  /** Delivery-provider failure is a red stop, not an ordinary warning. */
  hasStopIssue?: boolean;
  /**
   * D-d: позитивное доказательство доставки. Печатается ВСЕГДА, в том числе в зелёной
   * сводке: в июле «зелёное» означало «ошибок не залогировано», и это продержалось сутки.
   */
  deliveryEvidence?: DeliveryEvidence;
  /** D-d: вердикты dead man's switch; отсутствие пульса — красное, а не «нет данных». */
  heartbeats?: OperatorHeartbeatVerdict[];
  /** true после ручного resolve-all в окне — без строк recovery. */
  suppressRecovery: boolean;
};

export type OperatorHealthDigestResult = {
  lines: string[];
  hasIssues: boolean;
  icon: '🛑' | '⚠️' | '✅';
  /** true только когда есть ПОЗИТИВНОЕ доказательство доставки и живы оба пульса. */
  provenGreen: boolean;
};

function incidentDigestLabel(incident: OperatorIncidentDigestRow): string {
  return incident.integration === 'critical_alert_cadence'
    ? `${incident.direction} / ${incident.errorClass}`
    : `${incident.integration} / ${incident.errorClass}`;
}

function groupIncidentDigestLabels(
  incidents: OperatorIncidentDigestRow[],
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    const label = incidentDigestLabel(incident);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => ({ label, count }));
}

function formatIncidentDigestGroup(group: { label: string; count: number }): string {
  return group.count > 1 ? `${group.label} ×${group.count}` : group.label;
}

export function buildOperatorHealthDigest(
  input: OperatorHealthDigestInput,
): OperatorHealthDigestResult {
  const detailLines: string[] = [];

  const failingHeartbeats = (input.heartbeats ?? []).filter(isHeartbeatFailing);
  for (const verdict of failingHeartbeats) {
    detailLines.push(`Пропал пульс — ${verdict.label}: ${formatHeartbeatAge(verdict)}`);
  }
  if (input.deliveryEvidence && isOldestUnsentOverThreshold(input.deliveryEvidence)) {
    detailLines.push('Очередь доставки стоит: есть неотправленное старше порога');
  }

  if (input.auditErrorCount > 0) {
    detailLines.push(`Ошибки в журнале админки: ${input.auditErrorCount}`);
  }

  const openedGroups = groupIncidentDigestLabels(input.incidentsOpened);
  for (const group of openedGroups.slice(0, 3)) {
    detailLines.push(`Инцидент: ${formatIncidentDigestGroup(group)}`);
  }
  if (openedGroups.length > 3) {
    detailLines.push(`…и ещё ${openedGroups.length - 3} типов инцидентов`);
  }

  detailLines.push(...input.snapshotLines);

  if (!input.suppressRecovery && input.incidentsResolved.length > 0) {
    detailLines.push('Восстановлено за окно:');
    const resolvedGroups = groupIncidentDigestLabels(input.incidentsResolved);
    for (const group of resolvedGroups.slice(0, 2)) {
      detailLines.push(formatIncidentDigestGroup(group));
    }
    if (resolvedGroups.length > 2) {
      detailLines.push(`…и ещё ${resolvedGroups.length - 2} типов восстановлений`);
    }
  }

  for (const job of input.jobFailures.slice(0, 2)) {
    detailLines.push(`Сбой задачи: ${job.jobKey}`);
  }
  if (input.jobFailures.length > 2) {
    detailLines.push(`…и ещё ${input.jobFailures.length - 2} сбоев задач`);
  }

  const hasIssues = detailLines.length > 0;

  /**
   * D-d: «зелёный» обязан означать НАЛИЧИЕ доказательства.
   *
   * Если снимок доставки не передан вовсе, доказательства нет по определению — такая
   * сводка тоже не имеет права быть зелёной. Молчание не является доказательством.
   */
  const evidencePositive = input.deliveryEvidence
    ? hasPositiveDeliveryEvidence(input.deliveryEvidence)
    : false;
  const heartbeatsAlive = failingHeartbeats.length === 0;
  const provenGreen = evidencePositive && heartbeatsAlive;

  const isRed = Boolean(input.hasStopIssue) || !heartbeatsAlive || !evidencePositive;
  const icon = isRed ? '🛑' : hasIssues ? '⚠️' : '✅';
  const header = input.hasStopIssue
    ? '🛑 ! Критический сбой исходящей доставки'
    : !heartbeatsAlive
      ? '🛑 ! Пропал пульс доставки'
      : !evidencePositive
        ? '🛑 ! Нет подтверждений доставки'
        : hasIssues
          ? '⚠️ Сводка здоровья системы'
          : '✅ Всё в порядке';

  const lines = [header];
  if (hasIssues) {
    const budget = MAX_OPERATOR_HEALTH_DIGEST_LINES - 2 - (input.deliveryEvidence ? 3 : 1);
    lines.push(...detailLines.slice(0, Math.max(0, budget)));
  }
  // Доказательство печатается всегда — и в красной, и в зелёной сводке.
  lines.push(
    ...(input.deliveryEvidence
      ? buildDeliveryEvidenceLines(input.deliveryEvidence)
      : ['Доказательство доставки: НЕ СОБРАНО']),
  );
  lines.push(OPERATOR_HEALTH_DIGEST_LINK);

  return { lines, hasIssues, icon, provenGreen };
}
