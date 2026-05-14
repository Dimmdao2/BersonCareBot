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

export type OutgoingDeliveryQueueHealthSnapshot = {
  dueBacklog: number;
  deadTotal: number;
  oldestDueAgeSeconds: number | null;
};

export type OperatorHealthReadPort = {
  listOpenIncidents(limit: number): Promise<OperatorIncidentOpenRow[]>;
  /** Строки `operator_job_status` с `job_family = backup` (ключи `backup.hourly`, …). */
  listBackupJobStatus(): Promise<OperatorBackupJobStatusRow[]>;
  /** Метрики `public.outgoing_delivery_queue` для админских health-экранов. */
  getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot>;
};
