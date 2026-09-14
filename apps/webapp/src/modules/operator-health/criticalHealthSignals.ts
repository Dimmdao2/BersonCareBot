import { ADMIN_DELIVERY_DUE_BACKLOG_WARNING } from './adminHealthThresholds';
import type {
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
/**
 * Сколько подряд неудачных тиков нужно, чтобы будить человека из-за интегратора.
 *
 * Одной пробы мало: при переключении blue/green старый цвет ещё обслуживает, а его сосед-интегратор
 * уже остановлен, и одиночная проба честно видит «недоступен». 13.09.2026 ровно так владельцу и
 * ушло письмо «Критичный сбой: integrator API» в 22:15 — через двадцать секунд после этого живым
 * стал новый цвет, и всё было в порядке. Два тика подряд (пять минут) это отсекают, а настоящий
 * отказ задерживают на те же пять минут — цена, которую владелец согласился платить 14.09.
 */
export const INTEGRATOR_API_MIN_FAIL_RUNS = 2;

/** Счётчик подряд идущих отказов: успех обнуляет, отказ прибавляет. */
export function nextIntegratorApiFailRuns(
  previous: number | null | undefined,
  status: IntegratorApiStatus,
): number {
  if (status === 'ok') return 0;
  const prev = typeof previous === 'number' && Number.isFinite(previous) && previous > 0
    ? Math.trunc(previous)
    : 0;
  return prev + 1;
}

/** Читает счётчик из `operator_job_status.meta_json` тика критичного здоровья. */
export function readIntegratorApiFailRuns(
  metaJson: Record<string, unknown> | undefined | null,
): number {
  const value = metaJson?.integratorApiFailRuns;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
}
const OPERATOR_PROBE_FAILURE_ERROR_CLASSES = new Set([
  'max_probe_failed',
  'telegram_probe_failed',
  'google_calendar_probe_failed',
]);

export type DbStatus = 'up' | 'down';
export type IntegratorApiStatus = 'ok' | 'unreachable' | 'error';

export type VideoTranscodeHealthStatus = 'ok' | 'degraded' | 'error';

export type CriticalHealthSignalsInput = {
  webappDb: DbStatus;
  integratorApi: IntegratorApiStatus;
  /**
   * Сколько ТИКОВ ПОДРЯД интегратор отвечает не «ok». Поле необязательно, и это намеренно:
   * поверхности, которые просто ПОКАЗЫВАЮТ состояние (панель здоровья, баннер), обязаны краснеть
   * сразу и ничего сюда не передают. Подтверждение нужно только тем, кто БУДИТ человека письмом.
   */
  integratorApiFailRuns?: number;
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
  backupJobs: Record<string, BackupJobHealthRow>;
  /** Из `operator_job_status.meta_json.consecutiveFailRuns` (outbound probe). */
  probeConsecutiveFailRuns: number;
  /** Open incidents created by the integrator only after each probe's configured streak threshold. */
  probeIncidentsOpenCount?: number;
  videoTranscodeStatus: VideoTranscodeHealthStatus;
  /**
   * Сколько файлов отложено, потому что разбирать их НЕЧЕМ (`preview_status = 'blocked'`).
   *
   * Поручение владельца 14.09.2026: «надо уведомить глобал админа и просто записать эти медиа в
   * отложенные до исправления». Счётчик сам по себе и есть сигнал: он не растёт от времени, как
   * счётчик отказов, и гаснет ровно тогда, когда причина устранена, — деплой с недостающим
   * инструментом выпускает строки, и число становится нулём без чьего-либо участия.
   */
  blockedMediaPreviews?: number;
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

export function classifyOperatorHealthBannerSignals(input: OperatorHealthBannerInput): boolean {
  if (input.webappDb === 'down') return true;
  if (input.integratorApi !== 'ok') return true;
  if (input.videoTranscodeStatus === 'error') return true;
  if ((input.blockedMediaPreviews ?? 0) > 0) return true;
  if (Object.values(input.backupJobs).some((j) => classifyBackupJobHealth(j) !== 'ok')) return true;
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

/**
 * Одна строка бэкапа в том виде, в каком её видит тревога.
 *
 * `lastSuccessAt` и `staleAfterSec` появились здесь 14.09.2026 вместе с ответом на вопрос, почему о
 * полном отсутствии бэкапов боевой базы никто не узнал. Правило смотрело ровно на одно поле —
 * `lastStatus === 'failure'`, — то есть будило только тогда, когда бэкап ЗАПУСТИЛСЯ И УПАЛ. Бэкапа,
 * который не запускался никогда, в `operator_job_status` нет вовсе, и молчание правила означало
 * «всё хорошо». Именно этот случай и был на новом проде: ноль артефактов, зелёная панель.
 */
export type BackupJobHealthRow = {
  lastStatus: string;
  /** Время последнего УСПЕШНОГО прогона. `null`/отсутствие — успеха не было ни разу. */
  lastSuccessAt?: string | null;
  /** Порог из манифеста фоновых заданий: дольше него без успеха — уже не «пока не дошло». */
  staleAfterSec?: number;
};

export type BackupJobVerdict = 'ok' | 'failure' | 'never' | 'stale';

export const BACKUP_JOB_VERDICT_RU: Record<Exclude<BackupJobVerdict, 'ok'>, string> = {
  failure: 'последний прогон завершился ошибкой',
  never: 'успешного прогона не было НИ РАЗУ',
  stale: 'успешного прогона нет дольше допустимого срока',
};

/**
 * Отказ и отсутствие — разные беды, и обе критичны. Порядок проверок не косметика: строка, которая
 * И упала, И давно не имела успеха, должна называться упавшей — это точнее и ведёт к причине.
 *
 * Без `staleAfterSec` устаревание не проверяется: порог задаёт манифест, и выдумывать его здесь
 * значило бы завести вторую правду о том, как часто идёт бэкап.
 */
export function classifyBackupJobHealth(
  job: BackupJobHealthRow,
  nowMs: number = Date.now(),
): BackupJobVerdict {
  if (job.lastStatus === 'failure') return 'failure';

  const successMs = job.lastSuccessAt ? Date.parse(job.lastSuccessAt) : Number.NaN;
  if (!Number.isFinite(successMs)) {
    // Успех без отметки времени — не «никогда»: свежесть по нему не судить, но прогон был.
    // Настоящий скрипт пишет отметку всегда; так выглядят только старые и синтетические строки.
    return job.lastStatus === 'success' ? 'ok' : 'never';
  }

  const staleAfterSec = job.staleAfterSec;
  if (typeof staleAfterSec !== 'number' || !Number.isFinite(staleAfterSec) || staleAfterSec <= 0) {
    return 'ok';
  }
  return nowMs - successMs > staleAfterSec * 1000 ? 'stale' : 'ok';
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
  nowMs: number = Date.now(),
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

  // `?? INTEGRATOR_API_MIN_FAIL_RUNS` — поведение по умолчанию для тех, кто счётчик не ведёт:
  // они будят сразу, как и раньше. Порог применяется только там, где счётчик реально передан.
  if (
    input.integratorApi !== 'ok' &&
    (input.integratorApiFailRuns ?? INTEGRATOR_API_MIN_FAIL_RUNS) >= INTEGRATOR_API_MIN_FAIL_RUNS
  ) {
    out.push({
      topic: 'integrator_api',
      dedupKey: `critical:integrator_api:${input.integratorApi}`,
      pushTitle: 'Критичный сбой: integrator API',
      lines: [`Integrator API: ${input.integratorApi}`],
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

  for (const [jobKey, job] of Object.entries(input.backupJobs)) {
    const verdict = classifyBackupJobHealth(job, nowMs);
    if (verdict === 'ok') continue;
    out.push({
      topic: 'backup',
      dedupKey: `critical:backup:${jobKey}:${verdict}`,
      pushTitle: 'Критичный сбой: бэкап',
      lines: [`Бэкап ${jobKey}: ${BACKUP_JOB_VERDICT_RU[verdict]}`],
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

  const blockedPreviews = input.blockedMediaPreviews ?? 0;
  if (blockedPreviews > 0) {
    out.push({
      topic: 'media_preview_blocked',
      dedupKey: 'critical:media_preview_blocked:active',
      pushTitle: 'Критичный сбой: нечем разобрать файлы',
      lines: [
        `Файлов отложено до исправления: ${blockedPreviews}`,
        'Разобрать их нечем: в окружении нет нужного декодера. Повторы намеренно остановлены —',
        'строки вернутся в очередь сами, когда воркер на старте сообщит, что инструмент появился.',
      ],
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
