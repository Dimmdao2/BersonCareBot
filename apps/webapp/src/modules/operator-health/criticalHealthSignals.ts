import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from './adminHealthThresholds';
import { classifyIntegratorPushOutboxSystemHealthStatus } from './integratorPushOutboxHealth';
import type {
  IntegratorPushOutboxHealthSnapshot,
  OperatorIncidentOpenRow,
  OutgoingDeliveryQueueHealthSnapshot,
  WebhookBurstRow,
} from './ports';
import { OUTGOING_DELIVERY_DEAD_WINDOW_HOURS } from './ports';
import { isWebhookBurstCritical, WEBHOOK_BURST_MIN_COUNT } from './webhookBurst';
import type { TenantIsolationCriticalHealthSignal } from './tenantIsolationCriticalHealth';
import {
  OLDEST_UNSENT_ALERT_SECONDS,
  formatAgeRu,
  isOldestUnsentOverThreshold,
  type DeliveryEvidence,
} from './deliveryEvidence';
import { formatHeartbeatAge, isHeartbeatFailing, type OperatorHeartbeatVerdict } from './heartbeat';
import type { EmptyAudienceSignal } from '@/modules/operator-alerts/emptyAudience';
import {
  OUTBOUND_PROVIDER_INCIDENT_DIRECTION,
  describeOutboundProviderErrorClass,
  isPageOnFirstOccurrenceProviderErrorClass,
} from '@bersoncare/operator-db-schema';

/** Одна строка на оба приложения; определение — в `@bersoncare/operator-db-schema`. */
export const OUTBOUND_PROVIDER_FAILURE_DIRECTION = OUTBOUND_PROVIDER_INCIDENT_DIRECTION;
export const OUTBOUND_PROVIDER_FAILURE_WINDOW_MINUTES = 15;
export const OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS = 1;
export const OUTBOUND_PROVIDER_STOP_PREFIX = '🛑 !';
const OPERATOR_PROBE_FAILURE_ERROR_CLASSES = new Set([
  'max_probe_failed',
  'telegram_probe_failed',
  'google_calendar_probe_failed',
]);

export type DbStatus = 'up' | 'down';
export type IntegratorApiStatus = 'ok' | 'unreachable' | 'error';
export type ProjectionProbeStatus = 'ok' | 'degraded' | 'unreachable' | 'error';

export type CriticalHealthProjectionInput = {
  probeStatus: ProjectionProbeStatus;
  deadCount: number;
  retriesOverThreshold: number;
};

export type VideoTranscodeHealthStatus = 'ok' | 'degraded' | 'error';

export type CriticalHealthSignalsInput = {
  webappDb: DbStatus;
  integratorApi: IntegratorApiStatus;
  projection: CriticalHealthProjectionInput;
  /**
   * `deadRecent` — а не `deadTotal` — решает, красить ли и будить ли. `deadTotal` терминален и
   * только растёт; порог по нему даёт баннер, который горит вечно и потому не сообщает ничего.
   * Поле необязательно: путь, который читает старый сводный снимок без окна, честно откатывается
   * на `deadTotal` вместо того, чтобы молча считать очередь здоровой.
   */
  outgoingDelivery: Pick<OutgoingDeliveryQueueHealthSnapshot, 'deadTotal' | 'dueBacklog'> &
    Partial<Pick<OutgoingDeliveryQueueHealthSnapshot, 'deadRecent' | 'lastOperatorDeadAt'>>;
  outboundDeliveryProvider?: {
    recentIncidentCount: number;
    openIncidentCount?: number;
    /** Server-only cadence rows; never exposed by the classifier or UI API. */
    openIncidents?: OperatorIncidentOpenRow[];
  };
  integratorPushOutbox: IntegratorPushOutboxHealthSnapshot;
  backupJobs: Record<string, { lastStatus: string }>;
  /** Из `operator_job_status.meta_json.consecutiveFailRuns` (outbound probe). */
  probeConsecutiveFailRuns: number;
  /** Open incidents created by the integrator only after each probe's configured streak threshold. */
  probeIncidentsOpenCount?: number;
  videoTranscodeStatus: VideoTranscodeHealthStatus;
  /** Burst inbound webhook errors (P8); omit when lightweight collect skips webhook table. */
  webhookBursts?: WebhookBurstRow[];
  /** A3: low-cardinality tenant-isolation detector, collected only by the five-minute health tick. */
  tenantIsolation?: TenantIsolationCriticalHealthSignal;
  /**
   * D-d/D-f: позитивное доказательство доставки. Возраст самой старой неотправленной
   * позиции — самостоятельный сигнал: он один покрывает и исчерпание квоты, и смерть
   * воркера, и застрявшего потребителя.
   */
  deliveryEvidence?: DeliveryEvidence;
  /** D-d: вердикты dead man's switch. Алертом является ОТСУТСТВИЕ пульса. */
  heartbeats?: OperatorHeartbeatVerdict[];
  /** D-b: счётчик пустой аудитории; сам счётчик обязан звенеть. */
  emptyAudience?: EmptyAudienceSignal;
};

export type OperatorHealthBannerInput = CriticalHealthSignalsInput & {
  operatorIncidentsOpenCount: number;
};

export type CriticalAlertCandidate = {
  topic: string;
  dedupKey: string;
  lines: string[];
  pushTitle: string;
};

/**
 * Мёртвые строки, появившиеся ПРЯМО СЕЙЧАС. Именно они означают «механизм отказывает», и именно
 * этот счётчик умеет вернуться к нулю без вмешательства человека.
 *
 * Отличие от простого повышения порога: порог по `deadTotal` даёт ту же вечную красноту, только
 * позже. Отличие от TTL на строках: TTL стирает доказательство отказа, а оно нужно при разборе.
 */
export function countActiveOutgoingDeliveryDead(
  od: CriticalHealthSignalsInput['outgoingDelivery'],
): number {
  return od.deadRecent ?? od.deadTotal;
}

export function isProjectionCritical(p: CriticalHealthProjectionInput): boolean {
  if (p.probeStatus === 'unreachable' || p.probeStatus === 'error') return true;
  if (p.deadCount > 0) return true;
  return false;
}

export function isProjectionBannerWarn(p: CriticalHealthProjectionInput): boolean {
  if (isProjectionCritical(p)) return true;
  if (p.probeStatus === 'degraded' || p.retriesOverThreshold > 0) return true;
  return false;
}

export function classifyOperatorHealthBannerSignals(input: OperatorHealthBannerInput): boolean {
  if (input.webappDb === 'down') return true;
  if (input.integratorApi !== 'ok') return true;
  if (isProjectionBannerWarn(input.projection)) return true;
  if (input.videoTranscodeStatus === 'error') return true;
  if (Object.values(input.backupJobs).some((j) => j.lastStatus === 'failure')) return true;
  if (input.operatorIncidentsOpenCount > 0) return true;
  if ((input.probeIncidentsOpenCount ?? 0) > 0) return true;
  if ((input.webhookBursts ?? []).some(isWebhookBurstCritical)) return true;
  const od = input.outgoingDelivery;
  if (
    (input.outboundDeliveryProvider?.openIncidentCount ?? 0) >=
    OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS
  )
    return true;
  if (
    (input.outboundDeliveryProvider?.recentIncidentCount ?? 0) >=
    OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS
  )
    return true;
  if (
    countActiveOutgoingDeliveryDead(od) > 0 ||
    od.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING
  )
    return true;
  if (classifyIntegratorPushOutboxSystemHealthStatus(input.integratorPushOutbox) !== 'ok')
    return true;
  if (classifyTenantIsolationSignals(input.tenantIsolation).length > 0) return true;
  if (classifyProviderQuotaSignals(input.outboundDeliveryProvider?.openIncidents).length > 0)
    return true;
  if (input.deliveryEvidence && isOldestUnsentOverThreshold(input.deliveryEvidence)) return true;
  if ((input.heartbeats ?? []).some(isHeartbeatFailing)) return true;
  if (input.emptyAudience?.active) return true;
  return false;
}

/**
 * D-f: отказ провайдера по квоте/кредитам/учётным данным пейджится с ПЕРВОГО появления.
 *
 * Отдельно от общего `outbound_delivery_provider` намеренно: у того порог и общая
 * dedup-строка, а здесь одно событие обязано разбудить сразу и своим текстом сказать,
 * что именно кончилось. `454` иначе молча ретраится сутками, а `401` тонет в «учётка».
 */
export function classifyProviderQuotaSignals(
  incidents: OperatorIncidentOpenRow[] | undefined,
): CriticalAlertCandidate[] {
  const seen = new Set<string>();
  const out: CriticalAlertCandidate[] = [];
  for (const incident of incidents ?? []) {
    if (incident.direction !== OUTBOUND_PROVIDER_FAILURE_DIRECTION) continue;
    if (!isPageOnFirstOccurrenceProviderErrorClass(incident.errorClass)) continue;
    if (seen.has(incident.errorClass)) continue;
    seen.add(incident.errorClass);
    out.push({
      topic: 'outbound_provider_quota',
      dedupKey: `critical:outbound_provider_quota:${incident.integration}:${incident.errorClass}`,
      pushTitle: `${OUTBOUND_PROVIDER_STOP_PREFIX} Провайдер доставки отверг отправку`,
      lines: [
        `${OUTBOUND_PROVIDER_STOP_PREFIX} ${incident.integration}: ${describeOutboundProviderErrorClass(incident.errorClass)}`,
        `Класс: ${incident.errorClass}, срабатываний: ${incident.occurrenceCount}`,
        'Пейджится с первого раза: 4xx-квота ретраится молча, а 401 неотличим от кончившихся кредитов.',
      ],
    });
  }
  return out;
}

/** D-f: возраст самой старой неотправленной позиции, а не глубина очереди. */
export function classifyOldestUnsentSignals(
  evidence: DeliveryEvidence | undefined,
): CriticalAlertCandidate[] {
  if (!evidence || !isOldestUnsentOverThreshold(evidence)) return [];
  const age = evidence.oldestUnsentAgeSeconds ?? 0;
  return [
    {
      topic: 'outbound_oldest_unsent',
      dedupKey: 'critical:outbound_oldest_unsent:over_threshold',
      pushTitle: 'Критичный сбой: очередь доставки стоит',
      lines: [
        `Самая старая неотправленная позиция: ${formatAgeRu(age)} (порог ${formatAgeRu(OLDEST_UNSENT_ALERT_SECONDS)})`,
        evidence.lastConfirmedDeliveryAt
          ? `Последняя подтверждённая доставка: ${evidence.lastConfirmedDeliveryAt}`
          : 'Последняя подтверждённая доставка: НИКОГДА',
      ],
    },
  ];
}

/** D-d: алертом является ОТСУТСТВИЕ пульса. */
export function classifyHeartbeatSignals(
  heartbeats: OperatorHeartbeatVerdict[] | undefined,
): CriticalAlertCandidate[] {
  return (heartbeats ?? []).filter(isHeartbeatFailing).map((verdict) => ({
    topic: 'heartbeat_absent',
    dedupKey: `critical:heartbeat_absent:${verdict.name}:${verdict.status}`,
    pushTitle: 'Критичный сбой: пропал пульс',
    lines: [
      `${verdict.label}: пульс не приходит`,
      `Последний пульс: ${formatHeartbeatAge(verdict)} (порог ${formatAgeRu(verdict.staleAfterSec)})`,
    ],
  }));
}

/** D-b: сам счётчик пустой аудитории обязан алертить. */
export function classifyEmptyAudienceSignals(
  signal: EmptyAudienceSignal | undefined,
): CriticalAlertCandidate[] {
  if (!signal?.active) return [];
  return [
    {
      topic: 'notification_audience_empty',
      dedupKey: 'critical:notification_audience_empty:active',
      pushTitle: 'Критичный сбой: уведомлению некому уйти',
      lines: [
        `Уведомления с пустой аудиторией: всего ${signal.total}`,
        `Последнее место: ${signal.lastTopic ?? 'неизвестно'} (${signal.lastAt ?? '—'})`,
        ...signal.topTopics.map((t) => `${t.topic}: ${t.count}`),
      ],
    },
  ];
}

/**
 * Counts only recent, open, low-cardinality provider incident classes. One incident is enough
 * to raise the owner-approved critical signal; occurrence history is intentionally not treated
 * as a sliding-window event count because the existing incident store does not retain timestamps
 * per occurrence.
 */
export function countRecentOutboundProviderFailureIncidents(
  incidents: OperatorIncidentOpenRow[],
  nowMs = Date.now(),
): number {
  const cutoffMs = nowMs - OUTBOUND_PROVIDER_FAILURE_WINDOW_MINUTES * 60_000;
  return incidents.filter((incident) => {
    if (incident.direction !== OUTBOUND_PROVIDER_FAILURE_DIRECTION) return false;
    const lastSeenMs = Date.parse(incident.lastSeenAt);
    return Number.isFinite(lastSeenMs) && lastSeenMs >= cutoffMs && lastSeenMs <= nowMs;
  }).length;
}

export function isOperatorProbeFailureIncident(
  incident: Pick<OperatorIncidentOpenRow, 'direction' | 'errorClass'>,
): boolean {
  return (
    incident.direction === 'outbound' &&
    OPERATOR_PROBE_FAILURE_ERROR_CLASSES.has(incident.errorClass)
  );
}

function classifyTenantIsolationSignals(
  input: TenantIsolationCriticalHealthSignal | undefined,
): CriticalAlertCandidate[] {
  if (!input) return [];
  const out: CriticalAlertCandidate[] = [];
  if (input.runtime.critical) {
    out.push({
      topic: 'tenant_isolation_runtime',
      dedupKey: 'critical:tenant_isolation:runtime',
      pushTitle: 'Критичный сбой: изоляция организаций',
      lines: [
        'Изоляция организаций: обнаружено нарушение runtime-контекста',
        `Без принципала: +${input.runtime.missingPrincipalDelta}`,
      ],
    });
  }
  if (input.diagnostics.status === 'critical' || input.diagnostics.status === 'unavailable') {
    out.push({
      topic: 'tenant_isolation_diagnostics',
      dedupKey: `critical:tenant_isolation:diagnostics:${input.diagnostics.status}`,
      pushTitle: 'Критичный сбой: диагностика изоляции',
      lines: [
        `Диагностика изоляции: ${input.diagnostics.status}`,
        `Активных необъяснённых событий: ${input.diagnostics.activeUnexplainedEvents}`,
      ],
    });
  }
  if (input.wentDark.status === 'critical' || input.wentDark.status === 'unavailable') {
    out.push({
      topic: 'tenant_isolation_went_dark',
      dedupKey: `critical:tenant_isolation:went_dark:${input.wentDark.status}`,
      pushTitle: 'Критичный сбой: tenant-канарейка',
      lines: [
        `Tenant-канарейка: ${input.wentDark.status}`,
        `Организаций без ожидаемого сигнала: ${input.wentDark.affectedOrganizations}`,
      ],
    });
  }
  return out;
}

export function classifyCriticalHealthSignals(
  input: CriticalHealthSignalsInput,
): CriticalAlertCandidate[] {
  const out: CriticalAlertCandidate[] = [];

  if (input.webappDb === 'down') {
    out.push({
      topic: 'webapp_db',
      dedupKey: 'critical:webapp_db:down',
      pushTitle: 'Критичный сбой: БД webapp',
      lines: ['БД webapp: недоступна'],
    });
  }

  if (input.integratorApi !== 'ok') {
    out.push({
      topic: 'integrator_api',
      dedupKey: `critical:integrator_api:${input.integratorApi}`,
      pushTitle: 'Критичный сбой: integrator API',
      lines: [`Integrator API: ${input.integratorApi}`],
    });
  }

  if (isProjectionCritical(input.projection)) {
    const reason =
      input.projection.probeStatus === 'unreachable' || input.projection.probeStatus === 'error'
        ? input.projection.probeStatus
        : input.projection.deadCount > 0
          ? `dead:${input.projection.deadCount}`
          : 'critical';
    out.push({
      topic: 'projection',
      dedupKey: `critical:projection:${reason}`,
      pushTitle: 'Критичный сбой: projection outbox',
      lines: [
        `Projection: ${input.projection.probeStatus}`,
        ...(input.projection.deadCount > 0 ? [`dead: ${input.projection.deadCount}`] : []),
        ...(input.projection.retriesOverThreshold > 0
          ? [`retriesOverThreshold: ${input.projection.retriesOverThreshold}`]
          : []),
      ],
    });
  }

  const recentProviderIncidents = input.outboundDeliveryProvider?.recentIncidentCount ?? 0;
  const openProviderIncidents = input.outboundDeliveryProvider?.openIncidentCount ?? 0;
  const activeDead = countActiveOutgoingDeliveryDead(input.outgoingDelivery);
  if (
    activeDead > 0 ||
    openProviderIncidents >= OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS ||
    recentProviderIncidents >= OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS
  ) {
    out.push({
      topic: 'outbound_delivery_provider',
      dedupKey: 'critical:outbound_delivery_provider:active',
      pushTitle: `${OUTBOUND_PROVIDER_STOP_PREFIX} Отказ провайдера доставки`,
      lines: [
        `${OUTBOUND_PROVIDER_STOP_PREFIX} Исходящая доставка: отказ провайдера`,
        ...(openProviderIncidents >= OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS
          ? [`Открытых инцидентов провайдера: ${openProviderIncidents}`]
          : []),
        ...(recentProviderIncidents >= OUTBOUND_PROVIDER_FAILURE_MIN_INCIDENTS
          ? [
              `Свежих классов синхронного отказа за ${OUTBOUND_PROVIDER_FAILURE_WINDOW_MINUTES} мин: ${recentProviderIncidents}`,
            ]
          : []),
        ...(activeDead > 0
          ? [
              `Мёртвых записей очереди за последние ${OUTGOING_DELIVERY_DEAD_WINDOW_HOURS} ч: ${activeDead}`,
              `Всего за историю: ${input.outgoingDelivery.deadTotal}`,
            ]
          : []),
      ],
    });
  }

  const ipoStatus = classifyIntegratorPushOutboxSystemHealthStatus(input.integratorPushOutbox);
  if (ipoStatus === 'error') {
    const hourKey = new Date().toISOString().slice(0, 13);
    out.push({
      topic: 'integrator_push_outbox',
      dedupKey: `ipo:${hourKey}:error`,
      pushTitle: 'Критичный сбой: очередь синка integrator',
      lines: [
        `Очередь integrator_push_outbox: ${ipoStatus}`,
        `Ждут (due): ${input.integratorPushOutbox.dueBacklog}, dead: ${input.integratorPushOutbox.deadTotal}`,
      ],
    });
  }

  for (const [jobKey, job] of Object.entries(input.backupJobs)) {
    if (job.lastStatus !== 'failure') continue;
    out.push({
      topic: 'backup',
      dedupKey: `critical:backup:${jobKey}:failure`,
      pushTitle: 'Критичный сбой: бэкап',
      lines: [`Бэкап ${jobKey}: последний прогон failure`],
    });
  }

  const probeIncidentsOpenCount = input.probeIncidentsOpenCount ?? 0;
  if (probeIncidentsOpenCount > 0) {
    out.push({
      topic: 'probe_outbound',
      dedupKey: 'critical:probe_outbound:active',
      pushTitle: 'Критичный сбой: исходящие пробы',
      lines: [
        `Синтетические пробы интеграций: ${input.probeConsecutiveFailRuns} подряд неуспешных запусков`,
        `Открытых инцидентов после настроенного порога: ${probeIncidentsOpenCount}`,
      ],
    });
  }

  if (input.videoTranscodeStatus === 'error') {
    out.push({
      topic: 'video_transcode',
      dedupKey: 'critical:video_transcode:error',
      pushTitle: 'Критичный сбой: транскод HLS',
      lines: ['Очередь транскода HLS: error'],
    });
  }

  for (const burst of input.webhookBursts ?? []) {
    if (!isWebhookBurstCritical(burst)) continue;
    out.push({
      topic: 'webhook_burst',
      dedupKey: `critical:webhook_burst:${burst.source}:${burst.errorClass}`,
      pushTitle: 'Критичный сбой: вебхук',
      lines: [
        `Вебхук ${burst.source}: ${burst.errorClass}`,
        `Ошибок за окно: ${burst.count} (порог ${WEBHOOK_BURST_MIN_COUNT})`,
      ],
    });
  }

  out.push(...classifyTenantIsolationSignals(input.tenantIsolation));
  out.push(...classifyProviderQuotaSignals(input.outboundDeliveryProvider?.openIncidents));
  out.push(...classifyOldestUnsentSignals(input.deliveryEvidence));
  out.push(...classifyHeartbeatSignals(input.heartbeats));
  out.push(...classifyEmptyAudienceSignals(input.emptyAudience));

  return out;
}
