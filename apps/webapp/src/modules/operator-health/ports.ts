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
  alertSentAt: string | null;
  acknowledgedAt?: string | null;
  initialAlertSentAt?: string | null;
  oneHourAlertSentAt?: string | null;
};

export type OutboundProviderAlertPhase = 'initial' | 'one_hour_repeat';
export type OutboundProviderAlertClaim = OperatorIncidentOpenRow & {
  phase: OutboundProviderAlertPhase;
  claimToken: string;
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

/** Окно «дохлые строки появляются прямо сейчас»; то же, что у `confirmedSentLast24h`. */
export const OUTGOING_DELIVERY_DEAD_WINDOW_HOURS = 24;

export type OutgoingDeliveryQueueHealthSnapshot = {
  dueBacklog: number;
  /**
   * Все операторские `dead` за историю. ИСТОРИЯ, а не авария: строка `dead` терминальна и
   * никогда не уходит сама, поэтому по этому числу нельзя ни алертить, ни красить баннер —
   * иначе один отказ в июне держит систему красной навсегда. Число остаётся на странице
   * здоровья: стирать историю нельзя, она и есть доказательство.
   */
  deadTotal: number;
  /**
   * Операторские `dead`, появившиеся за последние {@link OUTGOING_DELIVERY_DEAD_WINDOW_HOURS} часов.
   * ЭТО и есть «механизм отказывает прямо сейчас» — сигнал, который умеет погаснуть сам.
   */
  deadRecent: number;
  /** Момент последней операторской смерти строки; для текста алерта, не для порога. */
  lastOperatorDeadAt: string | null;
  /** Dead rows with `failure_class = recipient_blocked_bot` (info-only, not operator degradation). */
  blockedRecipientTotal: number;
  oldestDueAgeSeconds: number | null;
  dueByChannel: Record<string, number>;
  /** Due-строки по `outgoing_delivery_queue.kind` (внутренние ключи; для UI — маппинг). */
  dueByKind: Record<string, number>;
  deadByKind: Record<string, number>;
  processingCount: number;
  lastSentAt: string | null;
  /**
   * Подтверждённых доставок (`status = 'sent'`) за последние 24 ч.
   *
   * D-d: сводка обязана нести ПОЗИТИВНОЕ доказательство доставки, а не только отсутствие
   * записей об ошибках — иначе «зелёное» снова начинает означать «никто ничего не записал».
   */
  confirmedSentLast24h: number;
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

export type IntegrationWebhookLastStatusRow = {
  source: string;
  receivedAt: string;
  processedOk: number;
  errorClass: string | null;
  httpStatusReturned: number | null;
  detail: string | null;
};

export type WebhookBurstRow = {
  source: string;
  errorClass: string;
  count: number;
};

export const TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS = 4_096;

/**
 * Low-frequency tenant canary input. Organization ids stay inside the health
 * state machine and are never included in logs, alerts or metric labels.
 */
export type TenantIsolationCanaryOrganizationRow = {
  organizationId: string;
  isActive: boolean;
  memberRowCount: number;
};

export type TenantIsolationCanarySnapshot = {
  organizations: TenantIsolationCanaryOrganizationRow[];
  /** The bounded read cannot prove full coverage when this is true. */
  truncated: boolean;
};

export type OperatorHealthReadPort = {
  listOpenIncidents(limit: number): Promise<OperatorIncidentOpenRow[]>;
  /** Строки `operator_job_status` с `job_family = backup` (ключи `backup.hourly`, …). */
  listBackupJobStatus(): Promise<OperatorBackupJobStatusRow[]>;
  /** Одна строка `operator_job_status` или `null`, если ключ ещё не появлялся. */
  getOperatorJobStatus(jobFamily: string, jobKey: string): Promise<OperatorJobStatusTickRow | null>;
  /** Последний статус входящих вебхуков (`integration_webhook_last_status`). */
  listIntegrationWebhookLastStatus(): Promise<IntegrationWebhookLastStatusRow[]>;
  /** Ошибки вебхуков за скользящее окно (burst P8). */
  listWebhookBurstSignals(windowMinutes: number, minCount: number): Promise<WebhookBurstRow[]>;
  /** Метрики `public.outgoing_delivery_queue` для админских health-экранов. */
  getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot>;
  /** Метрики `public.integrator_push_outbox` (ретраи signed POST в integrator). */
  getIntegratorPushOutboxHealth(): Promise<IntegratorPushOutboxHealthSnapshot>;
  /** Bounded active-organization/member sentinel for the five-minute isolation detector. */
  getTenantIsolationCanarySnapshot(): Promise<TenantIsolationCanarySnapshot>;
};

export type OperatorJobTickWriteInput = {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  metaJson: Record<string, unknown>;
};

export type OperatorJobTickFailureWriteInput = OperatorJobTickWriteInput & {
  error: string;
};

export type OperatorHealthWritePort = {
  /** Универсальный upsert periodic job tick (cron / internal HTTP). */
  recordOperatorJobTickSuccess(input: OperatorJobTickWriteInput): Promise<void>;
  recordOperatorJobTickFailure(input: OperatorJobTickFailureWriteInput): Promise<void>;
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
  /** Закрыть все открытые строки `operator_incidents` (ручной сброс из «Здоровье системы»). */
  resolveAllOpenIncidents(): Promise<{ resolved: number }>;
  acknowledgeOpenOutboundProviderIncidents(): Promise<{ acknowledged: number }>;
  claimDueOutboundProviderAlert(input: {
    nowIso: string;
    staleBeforeIso: string;
    claimToken: string;
    excludeIncidentIds: string[];
  }): Promise<OutboundProviderAlertClaim | null>;
  completeOutboundProviderAlertClaim(input: {
    incidentId: string;
    phase: OutboundProviderAlertPhase;
    claimToken: string;
    sentAtIso: string;
  }): Promise<boolean>;
  releaseOutboundProviderAlertClaim(input: {
    incidentId: string;
    claimToken: string;
  }): Promise<boolean>;
  /** Durable cadence marker for open incidents; resolved rows are never changed. */
  markOpenIncidentsAlertSent(input: {
    incidentIds: string[];
    alertSentAtIso: string;
  }): Promise<{ updated: number }>;
  /** TTL purge `integration_webhook_error_events` (burst P8). */
  purgeIntegrationWebhookErrorEventsOlderThanHours(hours: number): Promise<{ deleted: number }>;
  /**
   * taskdb #1038: generalizes the T0 -> +1h escalation P3 built for
   * `outbound_delivery_provider` to EVERY `block: "critical"` topic, instead of the flat
   * 24h dedup silently swallowing repeats for the rest of the tick's candidates. Reuses the
   * same `operator_incidents` row/claim lifecycle rather than inventing a second mechanism.
   * `direction` carries the real topic; `integration`/`errorClass` are fixed marker values
   * (see `CRITICAL_ALERT_CADENCE_INTEGRATION`) so this namespace never collides with real
   * provider incidents (email/telegram/google_calendar) opened by the delivery-failure
   * detector. `nowIso` pins `opened_at` to the tick's own clock (not the DB server's), so
   * cadence math stays deterministic under a simulated `now`.
   */
  openOrTouchCriticalAlertIncident(input: {
    dedupKey: string;
    direction: string;
    /** Which cadence owns this row — see {@link OperatorIncidentCadenceIntegration}. */
    integration: OperatorIncidentCadenceIntegration;
    nowIso: string;
    errorDetail?: string | null;
  }): Promise<{ id: string; openedAt: string }>;
  /** Claim ONE specific incident's due alert (initial or +1h) if its cadence window has arrived. */
  claimIncidentAlertIfDue(input: {
    incidentId: string;
    nowIso: string;
    staleBeforeIso: string;
    claimToken: string;
  }): Promise<OutboundProviderAlertClaim | null>;
  /**
   * Resolve every open critical-alert incident OF THIS CADENCE (see
   * `openOrTouchCriticalAlertIncident`) whose dedup key is NOT among this tick's active critical
   * candidates — the fault cleared, so a LATER recurrence of the same dedup key opens a fresh row
   * and starts a new T0 escalation instead of staying silent forever behind an incident that never
   * resolved.
   *
   * `integration` is required and NOT optional on purpose: this sweep resolves by absence, so a
   * caller that omitted its own namespace would close every OTHER cadence's open rows. The
   * five-minute health tick knows nothing about the reconciliation's dedup keys and vice versa;
   * without the split each tick would close the other's incident and the next run would reopen it,
   * paging the owner hourly for one unchanged fault — exactly what he forbade.
   */
  resolveStaleCriticalAlertIncidents(input: {
    integration: OperatorIncidentCadenceIntegration;
    activeDedupKeys: string[];
  }): Promise<{ resolved: number }>;
};

/**
 * Reserved `operator_incidents.integration` marker for rows opened by
 * `openOrTouchCriticalAlertIncident` (generic critical-alert cadence, taskdb #1038). Never a
 * real integration name (email/telegram/google_calendar), so the resolve-sweep and the
 * outbound-provider failure detector can never step on each other's rows.
 */
export const CRITICAL_ALERT_CADENCE_INTEGRATION = 'critical_alert_cadence';

/**
 * Reserved `operator_incidents.integration` marker for rows opened by the SaaS billing
 * reconciliation sweep. Separate from {@link CRITICAL_ALERT_CADENCE_INTEGRATION} because the two
 * cadences run on different clocks over different candidate sets and each resolves its stale rows
 * by absence — sharing one marker makes them close each other's incidents.
 */
export const SAAS_BILLING_RECONCILE_CADENCE_INTEGRATION = 'saas_billing_reconcile_cadence';

/**
 * The closed set of cadence namespaces over `operator_incidents`. Adding a cadence means adding a
 * member here, which is what makes the open/resolve pair name its own namespace or fail the build.
 */
export type OperatorIncidentCadenceIntegration =
  typeof CRITICAL_ALERT_CADENCE_INTEGRATION | typeof SAAS_BILLING_RECONCILE_CADENCE_INTEGRATION;
