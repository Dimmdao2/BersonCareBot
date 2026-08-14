export const SAAS_ISOLATION_DIAGNOSTICS_SCHEMA_VERSION = 3 as const;
export const SAAS_ISOLATION_COVERAGE_FRESH_HOURS = 24;

export const SAAS_ISOLATION_EVENT_CLASSES = [
  'missing_principal',
  'invalid_signature_or_install',
  'role_pool_mismatch',
  'rls_denial',
  'cleanup_failure',
  'unclassified_background_operation',
] as const;
export type SaasIsolationEventClass = (typeof SAAS_ISOLATION_EVENT_CLASSES)[number];

export const SAAS_ISOLATION_REQUIRED_SERVICES = [
  'webapp',
  'integrator',
  'worker',
  'scheduler',
  'media_worker',
  'cron',
] as const;
export const SAAS_ISOLATION_SOURCE_SERVICES = SAAS_ISOLATION_REQUIRED_SERVICES;
export type SaasIsolationSourceService = (typeof SAAS_ISOLATION_SOURCE_SERVICES)[number];

/** Closed route/job templates. Never persist a concrete URL, job id, SQL string or payload. */
export const SAAS_ISOLATION_SOURCE_OPERATIONS = [
  'webapp_db_request',
  'webapp_admin_system_health',
  'public_auth_config',
  'auth_role_config',
  'patient_runtime_config',
  'public_booking_config',
  'patient_identity_exception_check',
  'patient_booking_catalog',
  'patient_booking_history',
  'patient_product_analytics',
  'patient_ui_config',
  'patient_calendar_timezone',
  'patient_content_catalog',
  'patient_diary',
  'integrator_http_request',
  'integrator_projection',
  'worker_queue_drain',
  'worker_projection_delivery',
  'worker_outgoing_delivery',
  'scheduler_lock',
  'scheduler_dispatch_tick',
  'media_transcode_tick',
  'cron_health',
  'cron_media',
  'cron_analytics',
  'cron_reminders',
  'cron_specialist_tasks',
] as const;
export type SaasIsolationSourceOperation = (typeof SAAS_ISOLATION_SOURCE_OPERATIONS)[number];

const OPERATIONS_BY_SERVICE: Readonly<
  Record<SaasIsolationSourceService, readonly SaasIsolationSourceOperation[]>
> = {
  webapp: [
    'webapp_db_request',
    'webapp_admin_system_health',
    'public_auth_config',
    'auth_role_config',
    'patient_runtime_config',
    'public_booking_config',
    'patient_identity_exception_check',
    'patient_booking_catalog',
    'patient_booking_history',
    'patient_product_analytics',
    'patient_ui_config',
    'patient_calendar_timezone',
    'patient_content_catalog',
    'patient_diary',
  ],
  integrator: ['integrator_http_request', 'integrator_projection'],
  worker: ['worker_queue_drain', 'worker_projection_delivery', 'worker_outgoing_delivery'],
  scheduler: ['scheduler_lock', 'scheduler_dispatch_tick'],
  media_worker: ['media_transcode_tick'],
  cron: ['cron_health', 'cron_media', 'cron_analytics', 'cron_reminders', 'cron_specialist_tasks'],
};

export type SaasIsolationExplanationStatus = 'explained' | 'unexplained';
export type SaasIsolationLifecycleStatus = 'active' | 'resolved';
export type SaasIsolationCoverageStatus = 'complete' | 'incomplete' | 'failed';

export type ReportSaasIsolationEventInput = {
  eventClass: SaasIsolationEventClass;
  sourceService: SaasIsolationSourceService;
  sourceOperation: SaasIsolationSourceOperation;
  explanationStatus?: SaasIsolationExplanationStatus;
};

export type RecordSaasIsolationCoverageInput = {
  /** Caller-generated UUID is the idempotency key for one E2 run. */
  id: string;
  status: SaasIsolationCoverageStatus;
  startedAt: string;
  finishedAt: string;
  servicesChecked: SaasIsolationSourceService[];
  checksCount: number;
  unexpectedErrorsCount: number;
};

export type SaasIsolationEventAggregate = {
  eventClass: SaasIsolationEventClass;
  sourceService: SaasIsolationSourceService;
  sourceOperation: SaasIsolationSourceOperation;
  explanationStatus: SaasIsolationExplanationStatus;
  lifecycleStatus: SaasIsolationLifecycleStatus;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};
export type SaasIsolationCoverageRun = RecordSaasIsolationCoverageInput;

export type SaasIsolationDailyTrendPoint = {
  /** UTC calendar date. */
  date: string;
  count: number;
};

export type SaasIsolationTrend = {
  /** Database statement anchor used for both window calculation and date validation. */
  asOf: string;
  current24Hours: number;
  previous24Hours: number;
  delta: number;
  daily7Days: SaasIsolationDailyTrendPoint[];
};

export type SaasIsolationDiagnosticsPort = {
  recordEvent(input: ReportSaasIsolationEventInput): Promise<void>;
  /** Atomically/idempotently records a run and resolves only checked service families. */
  recordCoverageAndResolve(input: RecordSaasIsolationCoverageInput): Promise<void>;
  listEventAggregates(): Promise<unknown[]>;
  getLastCoverageRun(): Promise<unknown | null>;
  getTrend(): Promise<unknown>;
};

export type SaasIsolationHealthStatus = 'critical' | 'incomplete' | 'stale' | 'okay';
export const SAAS_ISOLATION_STATUS_REASONS = [
  'active_unexplained_event',
  'coverage_unexpected_error',
  'coverage_missing',
  'coverage_failed',
  'coverage_services_missing',
  'coverage_checks_empty',
  'active_explained_event',
  'coverage_stale',
] as const;
export type SaasIsolationStatusReason = (typeof SAAS_ISOLATION_STATUS_REASONS)[number];

export type SaasIsolationHealthPayload = {
  schemaVersion: typeof SAAS_ISOLATION_DIAGNOSTICS_SCHEMA_VERSION;
  status: SaasIsolationHealthStatus;
  statusReasons: SaasIsolationStatusReason[];
  active: { unexplained: number; explained: number; occurrences: number };
  resolved: { unexplained: number; explained: number; occurrences: number };
  byClass: Partial<Record<SaasIsolationEventClass, number>>;
  events: SaasIsolationEventAggregate[];
  lastEventAt: string | null;
  lastCoverage: SaasIsolationCoverageRun | null;
  coverageFresh: boolean;
  coverageComplete: boolean;
  missingServices: SaasIsolationSourceService[];
  trend: SaasIsolationTrend;
};

function enumValue<T extends string>(values: readonly T[], value: unknown, code: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value))
    throw new Error(code);
  return value as T;
}

function strictObject(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(code);
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some((key) => !keys.includes(key))) throw new Error(code);
  return object;
}

function positiveInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(code);
  return value as number;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(code);
  return value as number;
}

function iso(value: unknown, code: string): string {
  if (typeof value !== 'string') throw new Error(code);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error(code);
  return value;
}

function utcDate(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(code);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw new Error(code);
  return value;
}

function uuid(value: unknown, code: string): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error(code);
  }
  return value;
}

function validateServiceOperation(
  service: SaasIsolationSourceService,
  operation: SaasIsolationSourceOperation,
): void {
  if (!OPERATIONS_BY_SERVICE[service].includes(operation))
    throw new Error('invalid_saas_isolation_service_operation');
}

export function redactSaasIsolationEventInput(
  input: ReportSaasIsolationEventInput,
): ReportSaasIsolationEventInput {
  const object = strictObject(
    input,
    ['eventClass', 'sourceService', 'sourceOperation', 'explanationStatus'],
    'unsafe_saas_isolation_event',
  );
  const eventClass = enumValue(
    SAAS_ISOLATION_EVENT_CLASSES,
    object.eventClass,
    'invalid_saas_isolation_event_class',
  );
  const sourceService = enumValue(
    SAAS_ISOLATION_SOURCE_SERVICES,
    object.sourceService,
    'invalid_saas_isolation_service',
  );
  const sourceOperation = enumValue(
    SAAS_ISOLATION_SOURCE_OPERATIONS,
    object.sourceOperation,
    'invalid_saas_isolation_operation',
  );
  validateServiceOperation(sourceService, sourceOperation);
  const explanationStatus =
    object.explanationStatus === undefined
      ? 'unexplained'
      : enumValue(
          ['explained', 'unexplained'] as const,
          object.explanationStatus,
          'invalid_saas_isolation_explanation',
        );
  return { eventClass, sourceService, sourceOperation, explanationStatus };
}

export function validateSaasIsolationCoverageInput(
  value: unknown,
): RecordSaasIsolationCoverageInput {
  const object = strictObject(
    value,
    [
      'id',
      'status',
      'startedAt',
      'finishedAt',
      'servicesChecked',
      'checksCount',
      'unexpectedErrorsCount',
    ],
    'unsafe_saas_isolation_coverage',
  );
  if (!Array.isArray(object.servicesChecked))
    throw new Error('invalid_saas_isolation_coverage_services');
  const servicesChecked = [
    ...new Set(
      object.servicesChecked.map((service) =>
        enumValue(SAAS_ISOLATION_SOURCE_SERVICES, service, 'invalid_saas_isolation_service'),
      ),
    ),
  ];
  const result: RecordSaasIsolationCoverageInput = {
    id: uuid(object.id, 'invalid_saas_isolation_coverage_id'),
    status: enumValue(
      ['complete', 'incomplete', 'failed'] as const,
      object.status,
      'invalid_saas_isolation_coverage_status',
    ),
    startedAt: iso(object.startedAt, 'invalid_saas_isolation_started_at'),
    finishedAt: iso(object.finishedAt, 'invalid_saas_isolation_finished_at'),
    servicesChecked,
    checksCount: nonNegativeInteger(object.checksCount, 'invalid_saas_isolation_checks_count'),
    unexpectedErrorsCount: nonNegativeInteger(
      object.unexpectedErrorsCount,
      'invalid_saas_isolation_unexpected_count',
    ),
  };
  if (result.finishedAt < result.startedAt) throw new Error('invalid_saas_isolation_coverage_time');
  if (
    result.status === 'complete' &&
    (servicesChecked.length !== SAAS_ISOLATION_REQUIRED_SERVICES.length ||
      result.checksCount < SAAS_ISOLATION_REQUIRED_SERVICES.length)
  ) {
    throw new Error('invalid_saas_isolation_complete_coverage');
  }
  return result;
}

export function validateSaasIsolationEventAggregate(value: unknown): SaasIsolationEventAggregate {
  const object = strictObject(
    value,
    [
      'eventClass',
      'sourceService',
      'sourceOperation',
      'explanationStatus',
      'lifecycleStatus',
      'occurrenceCount',
      'firstSeenAt',
      'lastSeenAt',
    ],
    'unsafe_saas_isolation_event_row',
  );
  const sourceService = enumValue(
    SAAS_ISOLATION_SOURCE_SERVICES,
    object.sourceService,
    'invalid_saas_isolation_service',
  );
  const sourceOperation = enumValue(
    SAAS_ISOLATION_SOURCE_OPERATIONS,
    object.sourceOperation,
    'invalid_saas_isolation_operation',
  );
  validateServiceOperation(sourceService, sourceOperation);
  return {
    eventClass: enumValue(
      SAAS_ISOLATION_EVENT_CLASSES,
      object.eventClass,
      'invalid_saas_isolation_event_class',
    ),
    sourceService,
    sourceOperation,
    explanationStatus: enumValue(
      ['explained', 'unexplained'] as const,
      object.explanationStatus,
      'invalid_saas_isolation_explanation',
    ),
    lifecycleStatus: enumValue(
      ['active', 'resolved'] as const,
      object.lifecycleStatus,
      'invalid_saas_isolation_lifecycle',
    ),
    occurrenceCount: positiveInteger(
      object.occurrenceCount,
      'invalid_saas_isolation_occurrence_count',
    ),
    firstSeenAt: iso(object.firstSeenAt, 'invalid_saas_isolation_first_seen'),
    lastSeenAt: iso(object.lastSeenAt, 'invalid_saas_isolation_last_seen'),
  };
}

export function validateSaasIsolationCoverageRun(value: unknown): SaasIsolationCoverageRun {
  return validateSaasIsolationCoverageInput(value);
}

export function emptySaasIsolationTrend(nowMs = Date.now()): SaasIsolationTrend {
  const today = new Date(nowMs);
  today.setUTCHours(0, 0, 0, 0);
  return {
    asOf: new Date(nowMs).toISOString(),
    current24Hours: 0,
    previous24Hours: 0,
    delta: 0,
    daily7Days: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return { date: date.toISOString().slice(0, 10), count: 0 };
    }),
  };
}

export function validateSaasIsolationTrend(value: unknown): SaasIsolationTrend {
  const object = strictObject(
    value,
    ['asOf', 'current24Hours', 'previous24Hours', 'daily7Days'],
    'unsafe_saas_isolation_trend',
  );
  if (!Array.isArray(object.daily7Days) || object.daily7Days.length !== 7) {
    throw new Error('invalid_saas_isolation_daily_trend');
  }
  const asOf = iso(object.asOf, 'invalid_saas_isolation_trend_as_of');
  const expectedDates = emptySaasIsolationTrend(Date.parse(asOf)).daily7Days.map(
    (point) => point.date,
  );
  const daily7Days = object.daily7Days.map((point, index) => {
    const row = strictObject(point, ['date', 'count'], 'unsafe_saas_isolation_daily_point');
    const date = utcDate(row.date, 'invalid_saas_isolation_daily_date');
    if (date !== expectedDates[index]) throw new Error('invalid_saas_isolation_daily_window');
    return { date, count: nonNegativeInteger(row.count, 'invalid_saas_isolation_daily_count') };
  });
  const current24Hours = nonNegativeInteger(
    object.current24Hours,
    'invalid_saas_isolation_current_24h',
  );
  const previous24Hours = nonNegativeInteger(
    object.previous24Hours,
    'invalid_saas_isolation_previous_24h',
  );
  return {
    asOf,
    current24Hours,
    previous24Hours,
    delta: current24Hours - previous24Hours,
    daily7Days,
  };
}

export function buildSaasIsolationHealthPayload(
  unsafeEvents: unknown[],
  unsafeLastCoverage: unknown | null,
  nowMs = Date.now(),
  unsafeTrend: unknown = {
    asOf: new Date(nowMs).toISOString(),
    current24Hours: 0,
    previous24Hours: 0,
    daily7Days: emptySaasIsolationTrend(nowMs).daily7Days,
  },
): SaasIsolationHealthPayload {
  const events = unsafeEvents.map(validateSaasIsolationEventAggregate);
  const lastCoverage =
    unsafeLastCoverage === null ? null : validateSaasIsolationCoverageRun(unsafeLastCoverage);
  const trend = validateSaasIsolationTrend(unsafeTrend);
  const active = { unexplained: 0, explained: 0, occurrences: 0 };
  const resolved = { unexplained: 0, explained: 0, occurrences: 0 };
  const byClass: Partial<Record<SaasIsolationEventClass, number>> = {};
  let lastEventAt: string | null = null;
  for (const event of events) {
    const bucket = event.lifecycleStatus === 'active' ? active : resolved;
    bucket[event.explanationStatus] += 1;
    bucket.occurrences += event.occurrenceCount;
    byClass[event.eventClass] = (byClass[event.eventClass] ?? 0) + event.occurrenceCount;
    if (lastEventAt === null || event.lastSeenAt > lastEventAt) lastEventAt = event.lastSeenAt;
  }
  const missingServices = SAAS_ISOLATION_REQUIRED_SERVICES.filter(
    (service) => !lastCoverage?.servicesChecked.includes(service),
  );
  const finishedMs = lastCoverage ? Date.parse(lastCoverage.finishedAt) : Number.NaN;
  const coverageFresh =
    Number.isFinite(finishedMs) &&
    finishedMs <= nowMs &&
    nowMs - finishedMs <= SAAS_ISOLATION_COVERAGE_FRESH_HOURS * 3_600_000;
  const coverageComplete =
    lastCoverage?.status === 'complete' &&
    missingServices.length === 0 &&
    lastCoverage.checksCount >= SAAS_ISOLATION_REQUIRED_SERVICES.length;
  const statusReasons: SaasIsolationStatusReason[] = [];
  if (active.unexplained > 0) statusReasons.push('active_unexplained_event');
  if ((lastCoverage?.unexpectedErrorsCount ?? 0) > 0)
    statusReasons.push('coverage_unexpected_error');
  if (!lastCoverage) statusReasons.push('coverage_missing');
  else if (lastCoverage.status === 'failed') statusReasons.push('coverage_failed');
  if (lastCoverage && missingServices.length > 0) statusReasons.push('coverage_services_missing');
  if (lastCoverage && lastCoverage.checksCount === 0) statusReasons.push('coverage_checks_empty');
  if (active.explained > 0) statusReasons.push('active_explained_event');
  if (coverageComplete && !coverageFresh) statusReasons.push('coverage_stale');
  const status: SaasIsolationHealthStatus = statusReasons.some(
    (reason) =>
      reason === 'active_unexplained_event' ||
      reason === 'coverage_unexpected_error' ||
      reason === 'coverage_failed',
  )
    ? 'critical'
    : !coverageComplete || active.explained > 0
      ? 'incomplete'
      : !coverageFresh
        ? 'stale'
        : 'okay';
  return {
    schemaVersion: SAAS_ISOLATION_DIAGNOSTICS_SCHEMA_VERSION,
    status,
    statusReasons,
    active,
    resolved,
    byClass,
    events,
    lastEventAt,
    lastCoverage,
    coverageFresh,
    coverageComplete,
    missingServices,
    trend,
  };
}

export function createSaasIsolationDiagnosticsService(port: SaasIsolationDiagnosticsPort) {
  return {
    report: (input: ReportSaasIsolationEventInput) =>
      port.recordEvent(redactSaasIsolationEventInput(input)),
    recordCoverage: (input: RecordSaasIsolationCoverageInput) =>
      port.recordCoverageAndResolve(validateSaasIsolationCoverageInput(input)),
    async readHealth(nowMs = Date.now()): Promise<SaasIsolationHealthPayload> {
      const [events, coverage, trend] = await Promise.all([
        port.listEventAggregates(),
        port.getLastCoverageRun(),
        port.getTrend(),
      ]);
      return buildSaasIsolationHealthPayload(events, coverage, nowMs, trend);
    },
  };
}
export type SaasIsolationDiagnosticsService = ReturnType<
  typeof createSaasIsolationDiagnosticsService
>;
