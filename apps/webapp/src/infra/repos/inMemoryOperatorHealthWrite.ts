import type {
  OperatorHealthWritePort,
  OperatorIncidentCadenceIntegration,
} from '@/modules/operator-health/ports';

/** In-memory mirror of `operator_incidents` for the generic critical-alert cadence (#1038). */
type CriticalAlertIncidentRow = {
  id: string;
  dedupKey: string;
  direction: string;
  /** Which cadence opened the row — the resolve sweep never crosses this line, same as in Postgres. */
  integration: OperatorIncidentCadenceIntegration;
  openedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  errorDetail: string | null;
  resolvedAt: string | null;
  initialAlertSentAt: string | null;
  oneHourAlertSentAt: string | null;
  alertSentAt: string | null;
  alertClaimToken: string | null;
  alertClaimedAt: string | null;
};

const criticalAlertIncidentsByDedupKey = new Map<string, CriticalAlertIncidentRow>();
const criticalAlertIncidentsById = new Map<string, CriticalAlertIncidentRow>();
let criticalAlertIncidentSeq = 0;

/** Vitest only: clears the in-memory generic critical-alert cadence state between tests. */
export function resetInMemoryCriticalAlertIncidents(): void {
  criticalAlertIncidentsByDedupKey.clear();
  criticalAlertIncidentsById.clear();
  criticalAlertIncidentSeq = 0;
}

type SuccessCall = {
  startedAtIso: string;
  durationMs: number;
  metaJson: Record<string, unknown>;
};

type FailureCall = {
  startedAtIso: string;
  durationMs: number;
  error: string;
};

let reconcileSuccessThrowsForTests: Error | undefined;

/** Vitest только: reconcile route — тик упал до лога успеха (проверка HTTP 200). */
export function setOperatorHealthWriteReconcileSuccessThrowsForTests(err: Error | undefined): void {
  reconcileSuccessThrowsForTests = err;
}

/** For route tests (`webappReposAreInMemory`): последние вызовы reconcile-тик записи. */
export const mediaTranscodeReconcileWriteLog: Array<
  ({ kind: 'success' } & SuccessCall) | ({ kind: 'failure' } & FailureCall)
> = [];

export function resetMediaTranscodeReconcileWriteLog(): void {
  mediaTranscodeReconcileWriteLog.length = 0;
  reconcileSuccessThrowsForTests = undefined;
}

export const operatorJobTickWriteLog: Array<
  | ({ kind: 'success'; jobFamily: string; jobKey: string } & SuccessCall)
  | ({ kind: 'failure'; jobFamily: string; jobKey: string } & FailureCall & {
        metaJson: Record<string, unknown>;
      })
> = [];

export function resetOperatorJobTickWriteLog(): void {
  operatorJobTickWriteLog.length = 0;
}

export const inMemoryOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordOperatorJobTickSuccess(input) {
    operatorJobTickWriteLog.push({
      kind: 'success',
      jobFamily: input.jobFamily,
      jobKey: input.jobKey,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },

  async recordOperatorJobTickFailure(input) {
    operatorJobTickWriteLog.push({
      kind: 'failure',
      jobFamily: input.jobFamily,
      jobKey: input.jobKey,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: input.metaJson,
    });
  },

  async recordMediaTranscodeReconcileSuccess(input) {
    if (reconcileSuccessThrowsForTests != null) {
      throw reconcileSuccessThrowsForTests;
    }
    mediaTranscodeReconcileWriteLog.push({
      kind: 'success',
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },
  async recordMediaTranscodeReconcileFailure(input) {
    mediaTranscodeReconcileWriteLog.push({
      kind: 'failure',
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
    });
  },
  async resolveAllOpenIncidents() {
    return { resolved: 0 };
  },

  async acknowledgeOpenOutboundProviderIncidents() {
    return { acknowledged: 0 };
  },

  async claimDueOutboundProviderAlert() {
    return null;
  },

  // Shared by the outbound-provider special branch (fixture-driven ids in tests; never present
  // in `criticalAlertIncidentsById`, so these fall through to the harmless `true` default below)
  // AND the generic critical-alert cadence (#1038) claimed via `claimIncidentAlertIfDue`.
  async completeOutboundProviderAlertClaim(input) {
    const row = criticalAlertIncidentsById.get(input.incidentId);
    if (!row) return true;
    if (row.alertClaimToken !== input.claimToken || row.resolvedAt !== null) return false;
    if (input.phase === 'initial') row.initialAlertSentAt = input.sentAtIso;
    else row.oneHourAlertSentAt = input.sentAtIso;
    row.alertSentAt = input.sentAtIso;
    row.alertClaimToken = null;
    row.alertClaimedAt = null;
    return true;
  },

  async releaseOutboundProviderAlertClaim(input) {
    const row = criticalAlertIncidentsById.get(input.incidentId);
    if (!row) return true;
    if (row.alertClaimToken !== input.claimToken) return false;
    row.alertClaimToken = null;
    row.alertClaimedAt = null;
    return true;
  },

  async markOpenIncidentsAlertSent() {
    return { updated: 0 };
  },

  async openOrTouchCriticalAlertIncident(input) {
    const existing = criticalAlertIncidentsByDedupKey.get(input.dedupKey);
    if (existing && existing.resolvedAt === null) {
      existing.lastSeenAt = input.nowIso;
      existing.occurrenceCount += 1;
      if (input.errorDetail) existing.errorDetail = input.errorDetail;
      return { id: existing.id, openedAt: existing.openedAt };
    }
    criticalAlertIncidentSeq += 1;
    const row: CriticalAlertIncidentRow = {
      id: `in-memory-critical-incident-${criticalAlertIncidentSeq}`,
      dedupKey: input.dedupKey,
      direction: input.direction,
      integration: input.integration,
      openedAt: input.nowIso,
      lastSeenAt: input.nowIso,
      occurrenceCount: 1,
      errorDetail: input.errorDetail ?? null,
      resolvedAt: null,
      initialAlertSentAt: null,
      oneHourAlertSentAt: null,
      alertSentAt: null,
      alertClaimToken: null,
      alertClaimedAt: null,
    };
    criticalAlertIncidentsByDedupKey.set(input.dedupKey, row);
    criticalAlertIncidentsById.set(row.id, row);
    return { id: row.id, openedAt: row.openedAt };
  },

  async claimIncidentAlertIfDue(input) {
    const row = criticalAlertIncidentsById.get(input.incidentId);
    if (!row || row.resolvedAt !== null) return null;
    const nowMs = Date.parse(input.nowIso);
    const openedMs = Date.parse(row.openedAt);
    const staleBeforeMs = Date.parse(input.staleBeforeIso);
    if (row.alertClaimedAt !== null && Date.parse(row.alertClaimedAt) >= staleBeforeMs) return null;
    let phase: 'initial' | 'one_hour_repeat' | null = null;
    if (row.initialAlertSentAt === null) phase = 'initial';
    else if (row.oneHourAlertSentAt === null && openedMs + 60 * 60 * 1000 <= nowMs)
      phase = 'one_hour_repeat';
    if (!phase) return null;
    row.alertClaimToken = input.claimToken;
    row.alertClaimedAt = input.nowIso;
    return {
      id: row.id,
      dedupKey: row.dedupKey,
      direction: row.direction,
      integration: row.integration,
      errorClass: 'critical',
      errorDetail: row.errorDetail,
      openedAt: row.openedAt,
      lastSeenAt: row.lastSeenAt,
      occurrenceCount: row.occurrenceCount,
      alertSentAt: row.alertSentAt,
      acknowledgedAt: null,
      initialAlertSentAt: row.initialAlertSentAt,
      oneHourAlertSentAt: row.oneHourAlertSentAt,
      phase,
      claimToken: input.claimToken,
    };
  },

  async resolveStaleCriticalAlertIncidents(input) {
    const active = new Set(input.activeDedupKeys);
    const nowIso = new Date().toISOString();
    let resolved = 0;
    for (const row of criticalAlertIncidentsByDedupKey.values()) {
      if (row.resolvedAt !== null) continue;
      if (row.integration !== input.integration) continue;
      if (active.has(row.dedupKey)) continue;
      row.resolvedAt = nowIso;
      row.alertClaimToken = null;
      row.alertClaimedAt = null;
      resolved += 1;
    }
    return { resolved };
  },

  async purgeIntegrationWebhookErrorEventsOlderThanHours() {
    return { deleted: 0 };
  },
};
