/** Read-only доступ к таблицам операторского health (инциденты, статусы backup-job). */

export type OperatorIncidentOpenRow = {
  id: string;
  dedupKey: string;
  direction: string;
  integration: string;
  errorClass: string;
  errorDetail: string | null;
  openedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
};

export type OperatorBackupJobStatusRow = {
  jobKey: string;
  jobFamily: string;
  lastStatus: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
};

/** Строка `operator_job_status` с `meta_json` (для reconcile и др. periodic jobs). */
export type OperatorJobStatusTickRow = OperatorBackupJobStatusRow & {
  metaJson: Record<string, unknown>;
};

export type OutgoingDeliveryQueueHealthSnapshot = {
  dueBacklog: number;
  deadTotal: number;
  oldestDueAgeSeconds: number | null;
  dueByChannel: Record<string, number>;
  /** Due-строки по `outgoing_delivery_queue.kind` (внутренние ключи; для UI — маппинг). */
  dueByKind: Record<string, number>;
  deadByKind: Record<string, number>;
  processingCount: number;
  lastSentAt: string | null;
  lastQueueActivityAt: string | null;
};

/** Снимок `public.integrator_push_outbox` для админского health (без payload/idempotency). */
export type IntegratorPushOutboxHealthSnapshot = {
  dueBacklog: number;
  deadTotal: number;
  /** Возраст самой «старшей» due-pending строки: `now() - min(next_try_at)` среди due. */
  oldestDueAgeSeconds: number | null;
  dueByKind: Record<string, number>;
  deadByKind: Record<string, number>;
  processingCount: number;
  /** `now() - min(updated_at)` среди `processing` (null если нет processing). */
  oldestProcessingAgeSeconds: number | null;
  lastQueueActivityAt: string | null;
};

export type OperatorHealthReadPort = {
  listOpenIncidents(limit: number): Promise<OperatorIncidentOpenRow[]>;
  /** Строки `operator_job_status` с `job_family = backup` (ключи `backup.hourly`, …). */
  listBackupJobStatus(): Promise<OperatorBackupJobStatusRow[]>;
  /** Одна строка `operator_job_status` или `null`, если ключ ещё не появлялся. */
  getOperatorJobStatus(jobFamily: string, jobKey: string): Promise<OperatorJobStatusTickRow | null>;
  /** Метрики `public.outgoing_delivery_queue` для админских health-экранов. */
  getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot>;
  /** Метрики `public.integrator_push_outbox` (ретраи signed POST в integrator). */
  getIntegratorPushOutboxHealth(): Promise<IntegratorPushOutboxHealthSnapshot>;
};

export type OperatorHealthWritePort = {
  /** Успешный cron-тик reconcile (не должен пробрасывать наружу из роутера при уже успешном отчёте). */
  recordMediaTranscodeReconcileSuccess(input: {
    startedAtIso: string;
    durationMs: number;
    metaJson: Record<string, unknown>;
  }): Promise<void>;
  recordMediaTranscodeReconcileFailure(input: {
    startedAtIso: string;
    durationMs: number;
    error: string;
  }): Promise<void>;
};
