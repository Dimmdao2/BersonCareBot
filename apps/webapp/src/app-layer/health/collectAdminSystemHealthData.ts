import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import {
  ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
  ADMIN_PLAYBACK_CLIENT_ERRORS_1H_DEGRADED,
} from '@/app-layer/media/adminPlaybackHealthMetrics';
import { ADMIN_HLS_PROXY_METRICS_WINDOW_HOURS } from '@/app-layer/media/adminHlsProxyHealthMetrics';
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_OUTBOUND_PROBE_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';
import {
  buildIntegrationsHealthSnapshot,
  emptyIntegrationsHealthSnapshot,
  type IntegrationsHealthSnapshot,
} from '@/modules/operator-health/integrationHealthSnapshot';
import { readProbeConsecutiveFailRuns } from '@/modules/operator-health/probeOutboundMeta';
import type {
  IntegratorPushOutboxHealthSnapshot,
  OperatorJobStatusTickRow,
} from '@/modules/operator-health/ports';
import { classifyIntegratorPushOutboxSystemHealthStatus } from '@/modules/operator-health/integratorPushOutboxHealth';
import {
  collectCronJobsHealth,
  type CronJobsHealthPayload,
} from '@/app-layer/health/collectCronJobsHealth';
import {
  ADMIN_DELIVERY_DUE_BACKLOG_WARNING,
  classifyVideoTranscodeSystemHealthStatus,
} from '@/modules/operator-health/adminHealthThresholds';
import type { RemindersPipelineHealthPayload } from '@/app-layer/health/adminReminderPipelineMetrics';
import {
  classifyWebPushSystemHealthStatus,
  type WebPushHealthPayload,
} from '@/app-layer/health/adminWebPushHealthMetrics';
import {
  classifyNotificationDeliverySystemHealthStatus,
  emptyNotificationDeliveryHealthPayload,
  type NotificationDeliveryHealthPayload,
} from '@/app-layer/health/adminNotificationDeliveryHealthMetrics';
import {
  SAAS_ISOLATION_DIAGNOSTICS_SCHEMA_VERSION,
  emptySaasIsolationTrend,
  type SaasIsolationHealthPayload,
} from '@/modules/operator-health/saasIsolationDiagnostics';
import {
  loadCuratedPlaybackHealthSnapshot,
  loadCuratedSystemHealthSnapshot,
  type CuratedPlaybackHealthSnapshot,
  type CuratedSystemHealthSnapshot,
} from '@/infra/repos/pgCuratedSystemHealthDiagnostics';

const INTEGRATOR_TIMEOUT_MS = 8_000;

type DbStatus = 'up' | 'down';
type IntegratorApiStatus = 'ok' | 'unreachable' | 'error';
type PreviewStatus = 'pending' | 'ready' | 'failed' | 'skipped';
type PreviewMime = 'video/quicktime' | 'image/heic' | 'image/heif';
type MediaPreviewStatus = 'ok' | 'degraded' | 'error';
type MediaPreviewCounters = Record<PreviewMime, Record<PreviewStatus, number>>;

const PREVIEW_STATUSES: PreviewStatus[] = ['pending', 'ready', 'failed', 'skipped'];
const PREVIEW_MIMES: PreviewMime[] = ['video/quicktime', 'image/heic', 'image/heif'];

type VideoPlaybackHealthStatus = 'ok' | 'error';
type VideoPlaybackClientHealthStatus = 'ok' | 'degraded' | 'error';

type VideoPlaybackHealthPayload = {
  status: VideoPlaybackHealthStatus;
  windowHours: number;
  /** Rolling short window for `byDeliveryLast1h` (UTC buckets), hours. */
  windowHoursShort: number;
  /** Matches `video_playback_api_enabled`; informational for operators. */
  playbackApiEnabled: boolean;
  byDelivery: { hls: number; mp4: number; file: number };
  fallbackTotal: number;
  totalResolutions: number;
  /**
   * Пары (platform user, медиавидео), у которых первый когда-либо учтённый просмотр попал в rolling `windowHours`.
   * Отличается от `totalResolutions` (нет повторных визитов одного человека по тому же `media_id`).
   */
  uniquePlaybackPairsFirstSeenInWindow: number;
  byDeliveryLast1h: { hls: number; mp4: number; file: number };
  fallbackTotalLast1h: number;
  totalResolutionsLast1h: number;
};

type VideoPlaybackClientHealthPayload = {
  status: VideoPlaybackClientHealthStatus;
  windowHours: number;
  totalErrors: number;
  totalErrorsLast1h: number;
  byEvent: {
    hls_fatal: number;
    video_error: number;
    hls_import_failed: number;
    playback_refetch_failed: number;
    playback_refetch_exception: number;
    hls_js_unsupported: number;
  };
  byEventLast1h: {
    hls_fatal: number;
    video_error: number;
    hls_import_failed: number;
    playback_refetch_failed: number;
    playback_refetch_exception: number;
    hls_js_unsupported: number;
  };
  byDelivery: { hls: number; mp4: number; file: number };
  likelyLooping: boolean;
  recent: Array<{
    createdAt: string;
    mediaId: string;
    eventClass:
      | 'hls_fatal'
      | 'video_error'
      | 'hls_import_failed'
      | 'playback_refetch_failed'
      | 'playback_refetch_exception'
      | 'hls_js_unsupported';
    delivery: 'hls' | 'mp4' | 'file' | null;
    errorDetail: string | null;
  }>;
};

type VideoHlsProxyHealthStatus = 'ok' | 'degraded' | 'error';

type VideoHlsProxyHealthPayload = {
  status: VideoHlsProxyHealthStatus;
  windowHours: number;
  errorsTotal24h: number;
  errorsTotal1h: number;
  byReason: Record<string, number>;
  byReasonLast1h: Record<string, number>;
  degraded: boolean;
  recent: Array<{
    createdAt: string;
    mediaId: string;
    reasonCode: string;
    artifactKind: string;
  }>;
};

type VideoTranscodeHealthStatus = 'ok' | 'degraded' | 'error';

/** Снимок строки `operator_job_status` для periodic internal job ticks. */
export type OperatorJobStatusTickPayload = {
  jobKey: string;
  jobFamily: string;
  lastStatus: string;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  metaJson: Record<string, unknown>;
};

/** @deprecated alias — reconcile tick row */
export type VideoTranscodeLastReconcileTickPayload = OperatorJobStatusTickPayload;

/**
 * Поле `status`: при успешной пробе метрик — результат `classifyVideoTranscodeSystemHealthStatus`
 * (`modules/operator-health/adminHealthThresholds.ts`); при падении пробы — `error` из оболочки.
 */
type VideoTranscodeHealthPayload = {
  status: VideoTranscodeHealthStatus;
  pipelineEnabled: boolean;
  reconcileEnabled: boolean;
  pendingCount: number;
  processingCount: number;
  doneLastHour: number;
  failedLastHour: number;
  doneLast24h: number;
  failedLast24h: number;
  doneLifetime: number;
  failedLifetime: number;
  avgProcessingMsDoneLastHour: number | null;
  oldestPendingAgeSeconds: number | null;
  /** Кандидаты legacy-reconcile с учётом лимита размера (как фактическая постановка в очередь). */
  legacyReconcileCandidateCountWithinSizeCap: number;
  /** Готовые видео в читаемой библиотеке с непустым HLS master. */
  readableVideoReadyWithHlsCount: number;
  lastReconcileTick: VideoTranscodeLastReconcileTickPayload | null;
};

type OperatorBackupJobPayload = {
  lastStatus: string;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
};

export type OutgoingDeliveryHealthPayload = {
  dueBacklog: number;
  deadTotal: number;
  blockedRecipientTotal: number;
  oldestDueAgeSeconds: number | null;
  /** Количество due-строк по каналу (`outgoing_delivery_queue.channel`). */
  dueByChannel: Record<string, number>;
  dueByKind: Record<string, number>;
  deadByKind: Record<string, number>;
  /** Строки в `processing` (в т.ч. до сброса зависших). */
  processingCount: number;
  /** `max(sent_at)` по успешно отправленным строкам. */
  lastSentAt: string | null;
  /** `max(updated_at)` по всей таблице — последняя активность воркера/записей. */
  lastQueueActivityAt: string | null;
};

/** Очередь `integrator_push_outbox` (счётчики без payload). */
export type IntegratorPushOutboxHealthPayload = IntegratorPushOutboxHealthSnapshot;

export type SystemHealthResponse = {
  webappDb: DbStatus;
  integratorApi: { status: IntegratorApiStatus; db?: DbStatus };
  mediaCronWorkers: { status: 'configured' | 'not_configured' };
  mediaPreview: {
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  };
  /** VIDEO_HLS_DELIVERY: hourly aggregates of playback resolutions (UTC buckets), last `windowHours`. */
  videoPlayback: VideoPlaybackHealthPayload;
  /** Client-side HLS/playback runtime errors reported from browser/webview. */
  videoPlaybackClient: VideoPlaybackClientHealthPayload;
  /** HLS artifact proxy (`GET /api/media/.../hls/...`) server-side errors from DB telemetry. */
  videoHlsProxy: VideoHlsProxyHealthPayload;
  /** VIDEO_HLS: transcode queue metrics from DB (not systemd liveness). */
  videoTranscode: VideoTranscodeHealthPayload;
  /** Redacted aggregate of open operator incidents; never raw rows, IDs or error text. */
  operatorIncidents: {
    openCount: number;
    occurrenceCount: number;
    lastSeenAt: string | null;
    outboundProviderOpenCount?: number;
    outboundProviderAcknowledgedCount?: number;
  };
  /** Статусы backup job (`job_family = backup`), ключи `backup.hourly`, `backup.daily`, … */
  backupJobs: Record<string, OperatorBackupJobPayload>;
  /** Очередь исходящей доставки уведомлений (`public.outgoing_delivery_queue`). */
  outgoingDelivery: OutgoingDeliveryHealthPayload;
  /** Очередь синка настроек/напоминаний в integrator (`public.integrator_push_outbox`). */
  integratorPushOutbox: IntegratorPushOutboxHealthPayload;
  /** Напоминания: срез очереди `reminder_dispatch` + факты projection за 24 ч. */
  remindersPipeline: RemindersPipelineHealthPayload;
  /** Web Push: VAPID + активные подписки `user_web_push_subscriptions` (без агрегатов provider в БД). */
  webPush: WebPushHealthPayload;
  /** Фактические попытки доставки по каналам (`notification_delivery_attempts`), 24 ч. */
  notificationDelivery: NotificationDeliveryHealthPayload;
  /** Host cron / internal periodic jobs (`operator_job_status` + backup tiers). */
  cronJobs: CronJobsHealthPayload;
  /** Счётчик подряд неуспешных outbound probe-run (integrator → `operator_job_status`). */
  probeOutbound: { consecutiveFailRuns: number };
  /** Исходящие пробы и входящие вебхуки по интеграциям (PHASE F). */
  integrations: IntegrationsHealthSnapshot;
  /** Последняя успешная суточная сводка (`operator_health_alert_sent`, `digest:*`). */
  operatorHealthDigest: { lastSentAt: string | null };
  /** Redacted true-global diagnostics for tenant wall enforcement. */
  saasIsolation: SaasIsolationHealthPayload;
  meta: {
    probes: {
      webappDb: { status: string; durationMs: number; errorCode?: string };
      integratorApi: { status: string; durationMs: number; errorCode?: string };
      mediaPreview: { status: string; durationMs: number; errorCode?: string };
      videoPlayback: { status: string; durationMs: number; errorCode?: string };
      videoPlaybackClient: { status: string; durationMs: number; errorCode?: string };
      videoHlsProxy: { status: string; durationMs: number; errorCode?: string };
      videoTranscode: { status: string; durationMs: number; errorCode?: string };
      operatorIncidents: { status: string; durationMs: number; errorCode?: string };
      operatorBackupJobs: { status: string; durationMs: number; errorCode?: string };
      outgoingDelivery: { status: string; durationMs: number; errorCode?: string };
      integratorPushOutbox: { status: string; durationMs: number; errorCode?: string };
      remindersPipeline: { status: string; durationMs: number; errorCode?: string };
      webPush: { status: string; durationMs: number; errorCode?: string };
      notificationDelivery: { status: string; durationMs: number; errorCode?: string };
      cronJobs: { status: string; durationMs: number; errorCode?: string };
      saasIsolation: { status: string; durationMs: number; errorCode?: string };
    };
  };
  fetchedAt: string;
};

export type { CronJobsHealthPayload };

type ProbeResult<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; status: 'unreachable' | 'error'; errorCode: string; durationMs: number };

function nowIso(): string {
  return new Date().toISOString();
}

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toDbStatus(value: unknown): DbStatus | undefined {
  return value === 'up' || value === 'down' ? value : undefined;
}

async function probeWebappDb(): Promise<ProbeResult<DbStatus>> {
  const startedAt = Date.now();
  try {
    const dbOk = await buildAppDeps().health.checkDbHealth();
    return { ok: true, value: dbOk ? 'up' : 'down', durationMs: elapsedMs(startedAt) };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'webapp_db_check_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeIntegratorApi(): Promise<ProbeResult<{ status: 'ok'; db?: DbStatus }>> {
  const startedAt = Date.now();
  const base = (env.INTEGRATOR_API_URL ?? '').replace(/\/$/, '');
  if (!base) {
    return {
      ok: false,
      status: 'error',
      errorCode: 'integrator_url_not_configured',
      durationMs: elapsedMs(startedAt),
    };
  }

  try {
    const res = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...getCurrentCorrelationIdHeader() },
      cache: 'no-store',
      signal: AbortSignal.timeout(INTEGRATOR_TIMEOUT_MS),
    });
    const body = asObject(await res.json().catch(() => null));
    if (res.ok && body?.ok === true) {
      return {
        ok: true,
        value: { status: 'ok', db: toDbStatus(body.db) },
        durationMs: elapsedMs(startedAt),
      };
    }
    return {
      ok: false,
      status: 'error',
      errorCode: 'integrator_health_non_ok',
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'unreachable',
      errorCode: 'integrator_health_unreachable',
      durationMs: elapsedMs(startedAt),
    };
  }
}

function initMediaPreviewCounters(): MediaPreviewCounters {
  const byMime = {} as MediaPreviewCounters;
  for (const mime of PREVIEW_MIMES) {
    byMime[mime] = {
      pending: 0,
      ready: 0,
      failed: 0,
      skipped: 0,
    };
  }
  return byMime;
}

export function computeMediaPreviewStatus(
  counters: MediaPreviewCounters,
  stalePendingCount: number,
): MediaPreviewStatus {
  const failedCount = PREVIEW_MIMES.reduce((acc, mime) => acc + counters[mime].failed, 0);
  // #53: «pending» (preview ещё генерируется) и «skipped» (генерация осознанно
  // пропущена) — это НОРМАЛЬНАЯ асинхронная работа, не деградация. Деградацию даёт
  // только ЗАСТРЯВШИЙ pending (> 30 минут, считается внутри curated-агрегата);
  // реальный сбой генерации (failed) — это error. Иначе любая свежезагруженная
  // картинка с pending-превью ложно красила всю панель в «degraded».
  if (failedCount > 0) return 'error';
  if (stalePendingCount > 0) return 'degraded';
  return 'ok';
}

async function probeMediaPreview(snapshot: CuratedSystemHealthSnapshot): Promise<
  ProbeResult<{
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  }>
> {
  const startedAt = Date.now();
  try {
    const counters = initMediaPreviewCounters();
    for (const mime of PREVIEW_MIMES) {
      for (const status of PREVIEW_STATUSES) {
        counters[mime][status] = snapshot.mediaPreview.byMimeAndStatus[mime][status];
      }
    }
    const stale = snapshot.mediaPreview.stalePendingCount;
    return {
      ok: true,
      value: {
        status: computeMediaPreviewStatus(counters, stale),
        stalePendingCount: stale,
        byMimeAndStatus: counters,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'media_preview_probe_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

function emptyVideoPlaybackPayload(
  status: VideoPlaybackHealthStatus,
  playbackApiEnabled: boolean,
): VideoPlaybackHealthPayload {
  return {
    status,
    windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
    windowHoursShort: 1,
    playbackApiEnabled,
    byDelivery: { hls: 0, mp4: 0, file: 0 },
    fallbackTotal: 0,
    totalResolutions: 0,
    uniquePlaybackPairsFirstSeenInWindow: 0,
    byDeliveryLast1h: { hls: 0, mp4: 0, file: 0 },
    fallbackTotalLast1h: 0,
    totalResolutionsLast1h: 0,
  };
}

function emptyVideoPlaybackClientPayload(
  status: VideoPlaybackClientHealthStatus,
): VideoPlaybackClientHealthPayload {
  return {
    status,
    windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
    totalErrors: 0,
    totalErrorsLast1h: 0,
    byEvent: {
      hls_fatal: 0,
      video_error: 0,
      hls_import_failed: 0,
      playback_refetch_failed: 0,
      playback_refetch_exception: 0,
      hls_js_unsupported: 0,
    },
    byEventLast1h: {
      hls_fatal: 0,
      video_error: 0,
      hls_import_failed: 0,
      playback_refetch_failed: 0,
      playback_refetch_exception: 0,
      hls_js_unsupported: 0,
    },
    byDelivery: { hls: 0, mp4: 0, file: 0 },
    likelyLooping: false,
    recent: [],
  };
}

function emptyVideoHlsProxyPayload(status: VideoHlsProxyHealthStatus): VideoHlsProxyHealthPayload {
  return {
    status,
    windowHours: ADMIN_HLS_PROXY_METRICS_WINDOW_HOURS,
    errorsTotal24h: 0,
    errorsTotal1h: 0,
    byReason: {},
    byReasonLast1h: {},
    degraded: false,
    recent: [],
  };
}

function emptyVideoTranscodePayload(
  status: VideoTranscodeHealthStatus,
  pipelineEnabled: boolean,
  reconcileEnabled: boolean,
): VideoTranscodeHealthPayload {
  return {
    status,
    pipelineEnabled,
    reconcileEnabled,
    pendingCount: 0,
    processingCount: 0,
    doneLastHour: 0,
    failedLastHour: 0,
    doneLast24h: 0,
    failedLast24h: 0,
    doneLifetime: 0,
    failedLifetime: 0,
    avgProcessingMsDoneLastHour: null,
    oldestPendingAgeSeconds: null,
    legacyReconcileCandidateCountWithinSizeCap: 0,
    readableVideoReadyWithHlsCount: 0,
    lastReconcileTick: null,
  };
}

async function probeVideoPlayback(
  playbackApiEnabled: boolean,
  curatedPlayback: Promise<CuratedPlaybackHealthSnapshot> | null,
): Promise<ProbeResult<VideoPlaybackHealthPayload>> {
  const startedAt = Date.now();
  try {
    if (!playbackApiEnabled) {
      return {
        ok: true,
        value: {
          status: 'ok',
          windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
          windowHoursShort: 1,
          playbackApiEnabled: false,
          byDelivery: { hls: 0, mp4: 0, file: 0 },
          fallbackTotal: 0,
          totalResolutions: 0,
          uniquePlaybackPairsFirstSeenInWindow: 0,
          byDeliveryLast1h: { hls: 0, mp4: 0, file: 0 },
          fallbackTotalLast1h: 0,
          totalResolutionsLast1h: 0,
        },
        durationMs: elapsedMs(startedAt),
      };
    }

    if (!curatedPlayback) throw new Error('curated_playback_snapshot_missing');
    const metrics = await curatedPlayback;
    const metrics24 = metrics['24'];
    const metrics1 = metrics['1'];

    return {
      ok: true,
      value: {
        status: 'ok',
        windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
        windowHoursShort: 1,
        playbackApiEnabled: true,
        byDelivery: metrics24.byDelivery,
        fallbackTotal: metrics24.fallbackTotal,
        totalResolutions: metrics24.totalResolutions,
        uniquePlaybackPairsFirstSeenInWindow: metrics24.uniquePlaybackPairsFirstSeenInWindow,
        byDeliveryLast1h: metrics1.byDelivery,
        fallbackTotalLast1h: metrics1.fallbackTotal,
        totalResolutionsLast1h: metrics1.totalResolutions,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'video_playback_probe_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeVideoPlaybackClient(
  snapshot: CuratedSystemHealthSnapshot,
): Promise<ProbeResult<VideoPlaybackClientHealthPayload>> {
  const startedAt = Date.now();
  try {
    const m = snapshot.videoPlaybackClient;
    const status: VideoPlaybackClientHealthStatus =
      m.totalErrorsLast1h >= ADMIN_PLAYBACK_CLIENT_ERRORS_1H_DEGRADED ? 'degraded' : 'ok';
    return {
      ok: true,
      value: {
        status,
        windowHours: m.windowHours,
        totalErrors: m.totalErrors,
        totalErrorsLast1h: m.totalErrorsLast1h,
        byEvent: m.byEvent,
        byEventLast1h: m.byEventLast1h,
        byDelivery: m.byDelivery,
        likelyLooping: m.likelyLooping,
        recent: m.recent,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'video_playback_client_probe_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeVideoHlsProxy(
  playbackApiEnabled: boolean,
  curatedPlayback: Promise<CuratedPlaybackHealthSnapshot> | null,
): Promise<ProbeResult<VideoHlsProxyHealthPayload>> {
  const startedAt = Date.now();
  try {
    if (!playbackApiEnabled) {
      return {
        ok: true,
        value: emptyVideoHlsProxyPayload('ok'),
        durationMs: elapsedMs(startedAt),
      };
    }

    if (!curatedPlayback) throw new Error('curated_playback_snapshot_missing');
    const m = (await curatedPlayback).hlsProxy;
    const status: VideoHlsProxyHealthStatus = m.degraded ? 'degraded' : 'ok';
    return {
      ok: true,
      value: {
        status,
        windowHours: m.windowHours,
        errorsTotal24h: m.errorsTotal24h,
        errorsTotal1h: m.errorsTotal1h,
        byReason: m.byReason,
        byReasonLast1h: m.byReasonLast1h,
        degraded: m.degraded,
        recent: m.recent,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'video_hls_proxy_probe_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

type CuratedOperatorJob = CuratedSystemHealthSnapshot['operatorJobs'][number];

function operatorJobStatusRowToTickPayload(
  tickRow: OperatorJobStatusTickRow,
): OperatorJobStatusTickPayload {
  return {
    jobKey: tickRow.jobKey,
    jobFamily: tickRow.jobFamily,
    lastStatus: tickRow.lastStatus,
    lastFinishedAt: tickRow.lastFinishedAt,
    lastSuccessAt: tickRow.lastSuccessAt,
    lastFailureAt: tickRow.lastFailureAt,
    lastDurationMs: tickRow.lastDurationMs,
    lastError: tickRow.lastError,
    metaJson: tickRow.metaJson,
  };
}

function curatedJobToTickPayload(job: CuratedOperatorJob): OperatorJobStatusTickPayload {
  return operatorJobStatusRowToTickPayload({
    jobKey: job.jobKey,
    jobFamily: job.jobFamily,
    lastStatus: job.lastStatus,
    lastStartedAt: null,
    lastFinishedAt: job.lastFinishedAt,
    lastSuccessAt: job.lastSuccessAt,
    lastFailureAt: job.lastFailureAt,
    lastDurationMs: job.lastDurationMs,
    lastError: null,
    metaJson: job.safeMeta,
  });
}

function findCuratedJob(
  snapshot: CuratedSystemHealthSnapshot,
  jobFamily: string,
  jobKey: string,
): CuratedOperatorJob | undefined {
  return snapshot.operatorJobs.find((job) => job.jobFamily === jobFamily && job.jobKey === jobKey);
}

async function probeCuratedSystemHealth(): Promise<ProbeResult<CuratedSystemHealthSnapshot>> {
  const startedAt = Date.now();
  try {
    return {
      ok: true,
      value: await loadCuratedSystemHealthSnapshot(),
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'curated_system_health_read_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeSaasIsolation(): Promise<ProbeResult<SaasIsolationHealthPayload>> {
  const startedAt = Date.now();
  try {
    return {
      ok: true,
      value: await buildAppDeps().saasIsolationDiagnostics.readHealth(),
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: 'error',
      errorCode: 'saas_isolation_read_failed',
      durationMs: elapsedMs(startedAt),
    };
  }
}

function logProbe(
  probe:
    | 'webapp_db'
    | 'integrator_api'
    | 'media_preview'
    | 'video_playback'
    | 'video_playback_client'
    | 'video_hls_proxy'
    | 'video_transcode'
    | 'operator_incidents'
    | 'operator_backup_jobs'
    | 'outgoing_delivery'
    | 'integrator_push_outbox'
    | 'reminders_pipeline'
    | 'web_push'
    | 'notification_delivery'
    | 'cron_jobs'
    | 'saas_isolation',
  result: ProbeResult<unknown>,
  statusOverride?: string,
) {
  const status = statusOverride ?? (result.ok ? 'ok' : result.status);
  const payload = {
    probe,
    status,
    durationMs: result.durationMs,
    errorCode: result.ok ? undefined : result.errorCode,
  };
  if (result.ok) {
    logger.info(payload, 'system_health_probe');
  } else {
    logger.warn(payload, 'system_health_probe');
  }
}

const emptyOutgoingDeliveryHealthPayload = (): OutgoingDeliveryHealthPayload => ({
  dueBacklog: 0,
  deadTotal: 0,
  blockedRecipientTotal: 0,
  oldestDueAgeSeconds: null,
  dueByChannel: {},
  dueByKind: {},
  deadByKind: {},
  processingCount: 0,
  lastSentAt: null,
  lastQueueActivityAt: null,
});

const emptyIntegratorPushOutboxHealthPayload = (): IntegratorPushOutboxHealthPayload => ({
  dueBacklog: 0,
  deadTotal: 0,
  oldestDueAgeSeconds: null,
  dueByKind: {},
  deadByKind: {},
  processingCount: 0,
  oldestProcessingAgeSeconds: null,
  lastQueueActivityAt: null,
});

const emptySaasIsolationHealthPayload = (): SaasIsolationHealthPayload => ({
  schemaVersion: SAAS_ISOLATION_DIAGNOSTICS_SCHEMA_VERSION,
  status: 'incomplete',
  statusReasons: ['coverage_missing'],
  active: { unexplained: 0, explained: 0, occurrences: 0 },
  resolved: { unexplained: 0, explained: 0, occurrences: 0 },
  byClass: {},
  events: [],
  lastEventAt: null,
  lastCoverage: null,
  coverageFresh: false,
  coverageComplete: false,
  missingServices: ['webapp', 'integrator', 'worker', 'scheduler', 'media_worker', 'cron'],
  trend: emptySaasIsolationTrend(),
});

export async function collectAdminSystemHealthData(): Promise<SystemHealthResponse> {
  const curatedResult = await probeCuratedSystemHealth();
  const playbackEnabled = curatedResult.ok ? curatedResult.value.config.playbackEnabled : false;
  const curatedFailureStatus = curatedResult.ok ? ('error' as const) : curatedResult.status;
  const curatedFailureCode = curatedResult.ok
    ? 'curated_system_health_unavailable'
    : curatedResult.errorCode;
  const curatedPlayback =
    curatedResult.ok && playbackEnabled ? loadCuratedPlaybackHealthSnapshot() : null;

  const [
    webappDb,
    integratorApi,
    mediaPreview,
    videoPlayback,
    videoPlaybackClient,
    videoHlsProxy,
    saasIsolation,
  ] = await Promise.allSettled([
    probeWebappDb(),
    probeIntegratorApi(),
    curatedResult.ok
      ? probeMediaPreview(curatedResult.value)
      : Promise.resolve<
          ProbeResult<{
            status: MediaPreviewStatus;
            stalePendingCount: number;
            byMimeAndStatus: MediaPreviewCounters;
          }>
        >({
          ok: false,
          status: 'error',
          errorCode: 'curated_system_health_unavailable',
          durationMs: curatedResult.durationMs,
        }),
    curatedResult.ok
      ? probeVideoPlayback(playbackEnabled, curatedPlayback)
      : Promise.resolve<ProbeResult<VideoPlaybackHealthPayload>>({
          ok: false,
          status: 'error',
          errorCode: 'curated_config_unavailable',
          durationMs: curatedResult.durationMs,
        }),
    curatedResult.ok
      ? probeVideoPlaybackClient(curatedResult.value)
      : Promise.resolve<ProbeResult<VideoPlaybackClientHealthPayload>>({
          ok: false,
          status: 'error',
          errorCode: 'curated_system_health_unavailable',
          durationMs: curatedResult.durationMs,
        }),
    curatedResult.ok
      ? probeVideoHlsProxy(playbackEnabled, curatedPlayback)
      : Promise.resolve<ProbeResult<VideoHlsProxyHealthPayload>>({
          ok: false,
          status: 'error',
          errorCode: 'curated_config_unavailable',
          durationMs: curatedResult.durationMs,
        }),
    probeSaasIsolation(),
  ]);

  const webappDbResult: ProbeResult<DbStatus> =
    webappDb.status === 'fulfilled'
      ? webappDb.value
      : { ok: false, status: 'error', errorCode: 'webapp_db_probe_rejected', durationMs: 0 };

  const integratorApiResult: ProbeResult<{ status: 'ok'; db?: DbStatus }> =
    integratorApi.status === 'fulfilled'
      ? integratorApi.value
      : { ok: false, status: 'error', errorCode: 'integrator_probe_rejected', durationMs: 0 };

  const mediaPreviewResult: ProbeResult<{
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  }> =
    mediaPreview.status === 'fulfilled'
      ? mediaPreview.value
      : { ok: false, status: 'error', errorCode: 'media_preview_probe_rejected', durationMs: 0 };

  const videoPlaybackResult: ProbeResult<VideoPlaybackHealthPayload> =
    videoPlayback.status === 'fulfilled'
      ? videoPlayback.value
      : { ok: false, status: 'error', errorCode: 'video_playback_probe_rejected', durationMs: 0 };

  const videoPlaybackPayload: VideoPlaybackHealthPayload = videoPlaybackResult.ok
    ? videoPlaybackResult.value
    : emptyVideoPlaybackPayload('error', playbackEnabled);

  const videoPlaybackClientResult: ProbeResult<VideoPlaybackClientHealthPayload> =
    videoPlaybackClient.status === 'fulfilled'
      ? videoPlaybackClient.value
      : {
          ok: false,
          status: 'error',
          errorCode: 'video_playback_client_probe_rejected',
          durationMs: 0,
        };

  const videoPlaybackClientPayload: VideoPlaybackClientHealthPayload = videoPlaybackClientResult.ok
    ? videoPlaybackClientResult.value
    : emptyVideoPlaybackClientPayload('error');

  const videoHlsProxyResult: ProbeResult<VideoHlsProxyHealthPayload> =
    videoHlsProxy.status === 'fulfilled'
      ? videoHlsProxy.value
      : { ok: false, status: 'error', errorCode: 'video_hls_proxy_probe_rejected', durationMs: 0 };

  const videoHlsProxyPayload: VideoHlsProxyHealthPayload = videoHlsProxyResult.ok
    ? videoHlsProxyResult.value
    : emptyVideoHlsProxyPayload('error');

  const curatedSnapshot = curatedResult.ok ? curatedResult.value : null;
  const curatedJobRows: OperatorJobStatusTickRow[] = curatedSnapshot
    ? curatedSnapshot.operatorJobs.map((job) => ({
        jobKey: job.jobKey,
        jobFamily: job.jobFamily,
        lastStatus: job.lastStatus,
        lastStartedAt: null,
        lastFinishedAt: job.lastFinishedAt,
        lastSuccessAt: job.lastSuccessAt,
        lastFailureAt: job.lastFailureAt,
        lastDurationMs: job.lastDurationMs,
        lastError: null,
        metaJson: job.safeMeta,
      }))
    : [];

  const reconcileJob = curatedSnapshot
    ? findCuratedJob(
        curatedSnapshot,
        OPERATOR_MEDIA_JOB_FAMILY,
        OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      )
    : undefined;
  const videoTranscodeResult: ProbeResult<VideoTranscodeHealthPayload> = curatedSnapshot
    ? {
        ok: true,
        durationMs: curatedResult.durationMs,
        value: {
          status: classifyVideoTranscodeSystemHealthStatus({
            pipelineEnabled: curatedSnapshot.config.pipelineEnabled,
            reconcileEnabled: curatedSnapshot.config.reconcileEnabled,
            pendingCount: curatedSnapshot.videoTranscode.pendingCount,
            oldestPendingAgeSeconds: curatedSnapshot.videoTranscode.oldestPendingAgeSeconds,
            failedLastHour: curatedSnapshot.videoTranscode.failedLastHour,
            failedLast24h: curatedSnapshot.videoTranscode.failedLast24h,
            reconcileLastStatus: reconcileJob?.lastStatus ?? null,
          }),
          pipelineEnabled: curatedSnapshot.config.pipelineEnabled,
          reconcileEnabled: curatedSnapshot.config.reconcileEnabled,
          ...curatedSnapshot.videoTranscode,
          lastReconcileTick: reconcileJob ? curatedJobToTickPayload(reconcileJob) : null,
        },
      }
    : {
        ok: false,
        status: curatedFailureStatus,
        errorCode: curatedFailureCode,
        durationMs: curatedResult.durationMs,
      };

  const videoTranscodePayload: VideoTranscodeHealthPayload = videoTranscodeResult.ok
    ? videoTranscodeResult.value
    : emptyVideoTranscodePayload('error', false, false);

  const saasIsolationResult: ProbeResult<SaasIsolationHealthPayload> =
    saasIsolation.status === 'fulfilled'
      ? saasIsolation.value
      : { ok: false, status: 'error', errorCode: 'saas_isolation_probe_rejected', durationMs: 0 };
  const saasIsolationPayload = saasIsolationResult.ok
    ? saasIsolationResult.value
    : emptySaasIsolationHealthPayload();

  const operatorIncidents = curatedSnapshot?.operatorIncidents ?? {
    openCount: 0,
    occurrenceCount: 0,
    lastSeenAt: null,
  };
  const outboundProviderIncidents = curatedSnapshot?.outboundProviderIncidents ?? {
    openCount: 0,
    acknowledgedCount: 0,
    unacknowledgedCount: 0,
  };
  const operatorIncidentsPayload = {
    ...operatorIncidents,
    outboundProviderOpenCount: outboundProviderIncidents.openCount,
    outboundProviderAcknowledgedCount: outboundProviderIncidents.acknowledgedCount,
  };
  const backupJobs: Record<string, OperatorBackupJobPayload> = {};
  for (const job of curatedSnapshot?.operatorJobs ?? []) {
    if (job.jobFamily !== 'backup') continue;
    backupJobs[job.jobKey] = {
      lastStatus: job.lastStatus,
      lastStartedAt: null,
      lastFinishedAt: job.lastFinishedAt,
      lastSuccessAt: job.lastSuccessAt,
      lastFailureAt: job.lastFailureAt,
      lastDurationMs: job.lastDurationMs,
      lastError: null,
    };
  }

  const outgoingDeliveryPayload: OutgoingDeliveryHealthPayload = curatedSnapshot
    ? {
        dueBacklog: curatedSnapshot.outgoingDelivery.dueBacklog,
        deadTotal: curatedSnapshot.outgoingDelivery.deadTotal,
        blockedRecipientTotal: curatedSnapshot.outgoingDelivery.blockedRecipientTotal ?? 0,
        oldestDueAgeSeconds: curatedSnapshot.outgoingDelivery.oldestDueAgeSeconds,
        dueByChannel: curatedSnapshot.outgoingDelivery.dueByChannel ?? {},
        dueByKind: curatedSnapshot.outgoingDelivery.dueByKind,
        deadByKind: curatedSnapshot.outgoingDelivery.deadByKind,
        processingCount: curatedSnapshot.outgoingDelivery.processingCount,
        lastSentAt: curatedSnapshot.outgoingDelivery.lastSentAt ?? null,
        lastQueueActivityAt: curatedSnapshot.outgoingDelivery.lastQueueActivityAt,
      }
    : emptyOutgoingDeliveryHealthPayload();

  const integratorPushOutboxPayload: IntegratorPushOutboxHealthPayload = curatedSnapshot
    ? {
        dueBacklog: curatedSnapshot.integratorPushOutbox.dueBacklog,
        deadTotal: curatedSnapshot.integratorPushOutbox.deadTotal,
        oldestDueAgeSeconds: curatedSnapshot.integratorPushOutbox.oldestDueAgeSeconds,
        dueByKind: curatedSnapshot.integratorPushOutbox.dueByKind,
        deadByKind: curatedSnapshot.integratorPushOutbox.deadByKind,
        processingCount: curatedSnapshot.integratorPushOutbox.processingCount,
        oldestProcessingAgeSeconds:
          curatedSnapshot.integratorPushOutbox.oldestProcessingAgeSeconds ?? null,
        lastQueueActivityAt: curatedSnapshot.integratorPushOutbox.lastQueueActivityAt,
      }
    : emptyIntegratorPushOutboxHealthPayload();

  const outboundProbeJob = curatedSnapshot
    ? findCuratedJob(curatedSnapshot, OPERATOR_HEALTH_JOB_FAMILY, OPERATOR_OUTBOUND_PROBE_JOB_KEY)
    : undefined;
  const probeOutboundConsecutiveFailRuns = readProbeConsecutiveFailRuns(outboundProbeJob?.safeMeta);
  const integrationsPayload: IntegrationsHealthSnapshot = curatedSnapshot
    ? buildIntegrationsHealthSnapshot({
        probeMetaJson: outboundProbeJob?.safeMeta,
        probeLastFinishedAt: outboundProbeJob?.lastFinishedAt ?? null,
        webhookLastStatus: curatedSnapshot.integrationWebhookStatus.map((row) => ({
          source: row.source,
          receivedAt: row.receivedAt,
          processedOk: row.processedOk ? 1 : 0,
          errorClass: null,
          httpStatusReturned: row.httpStatusReturned,
          detail: null,
        })),
      })
    : emptyIntegrationsHealthSnapshot();

  const remindersPipelinePayload: RemindersPipelineHealthPayload = curatedSnapshot
    ? curatedSnapshot.remindersPipeline
    : {
        windowHours: 24,
        outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
        occurrenceHistory: { sent: 0, failed: 0 },
        deliveryEvents: { sent: 0, failed: 0 },
        patientReminderM2mIdempotencyKeysActive: 0,
      };
  const remindersPipelineResult = curatedResult.ok
    ? { ok: true as const, value: remindersPipelinePayload }
    : { ok: false as const, errorCode: curatedResult.errorCode };
  const remindersPipelineDurationMs = curatedResult.durationMs;

  const webPushPayload: WebPushHealthPayload = curatedSnapshot
    ? {
        ...curatedSnapshot.webPush,
        status: classifyWebPushSystemHealthStatus({
          vapidConfigured: curatedSnapshot.config.vapidConfigured,
          activeSubscriptionsCount: curatedSnapshot.webPush.activeSubscriptionsCount,
        }),
        vapidConfigured: curatedSnapshot.config.vapidConfigured,
        deliveryMetricsInDb: true,
      }
    : {
        windowHours: 24,
        status: 'error',
        vapidConfigured: false,
        activeSubscriptionsCount: 0,
        usersWithSubscriptionCount: 0,
        subscriptionsTouchedLast24h: 0,
        deliveryMetricsInDb: true,
      };
  const webPushResult = curatedResult.ok
    ? { ok: true as const, value: webPushPayload }
    : { ok: false as const, errorCode: curatedResult.errorCode };
  const webPushDurationMs = curatedResult.durationMs;

  const cronJobsStartedAt = Date.now();
  let cronJobsPayload: CronJobsHealthPayload = { status: 'no_data', jobs: [] };
  try {
    cronJobsPayload = curatedSnapshot
      ? await collectCronJobsHealth({ backupJobs, jobRows: curatedJobRows })
      : { status: 'error', jobs: [] };
  } catch {
    cronJobsPayload = { status: 'error', jobs: [] };
  }
  const cronJobsDurationMs = elapsedMs(cronJobsStartedAt);
  const cronJobsProbeStatus =
    cronJobsPayload.status === 'no_data' && cronJobsPayload.jobs.length === 0
      ? 'no_data'
      : cronJobsPayload.status;

  const notificationDeliveryPayload: NotificationDeliveryHealthPayload = curatedSnapshot
    ? {
        ...curatedSnapshot.notificationDelivery,
        status: classifyNotificationDeliverySystemHealthStatus({
          totalAttempts24h: curatedSnapshot.notificationDelivery.totalAttempts24h,
          byChannel: curatedSnapshot.notificationDelivery.byChannel,
          recentIssues: [],
          vapidConfigured: curatedSnapshot.config.vapidConfigured,
          smtpConfigured: curatedSnapshot.config.smtpConfigured,
        }),
        vapidConfigured: curatedSnapshot.config.vapidConfigured,
        smtpConfigured: curatedSnapshot.config.smtpConfigured,
      }
    : emptyNotificationDeliveryHealthPayload('error');
  const notificationDeliveryResult = curatedResult.ok
    ? { ok: true as const, value: notificationDeliveryPayload }
    : { ok: false as const, errorCode: curatedResult.errorCode };
  const notificationDeliveryDurationMs = curatedResult.durationMs;

  const integratorPushOutboxClassified = classifyIntegratorPushOutboxSystemHealthStatus(
    integratorPushOutboxPayload,
  );

  const operatorIncidentsProbeStatus = !curatedResult.ok
    ? curatedResult.status
    : outboundProviderIncidents.openCount > 0
      ? 'error'
      : operatorIncidents.openCount > 0
        ? 'degraded'
        : 'ok';

  const backupJobsProbeStatus = !curatedResult.ok
    ? curatedResult.status
    : Object.values(backupJobs).some((j) => j.lastStatus === 'failure')
      ? 'degraded'
      : 'ok';

  const outgoingDeliveryProbeStatus = !curatedResult.ok
    ? curatedResult.status
    : outgoingDeliveryPayload.deadTotal > 0 ||
        outgoingDeliveryPayload.dueBacklog >= ADMIN_DELIVERY_DUE_BACKLOG_WARNING
      ? 'degraded'
      : 'ok';

  const integratorPushOutboxProbeStatus = !curatedResult.ok
    ? curatedResult.status
    : integratorPushOutboxClassified === 'error'
      ? 'error'
      : integratorPushOutboxClassified === 'degraded'
        ? 'degraded'
        : 'ok';

  const operatorHealthDigestLastSentAt = curatedSnapshot?.operatorHealthDigestLastSentAt ?? null;

  const response: SystemHealthResponse = {
    webappDb: webappDbResult.ok ? webappDbResult.value : 'down',
    integratorApi: integratorApiResult.ok
      ? {
          status: 'ok',
          ...(integratorApiResult.value.db ? { db: integratorApiResult.value.db } : {}),
        }
      : { status: integratorApiResult.status },
    mediaCronWorkers: {
      status: env.INTERNAL_JOB_SECRET && isS3MediaEnabled(env) ? 'configured' : 'not_configured',
    },
    mediaPreview: mediaPreviewResult.ok
      ? mediaPreviewResult.value
      : {
          status: 'error',
          stalePendingCount: 0,
          byMimeAndStatus: initMediaPreviewCounters(),
        },
    videoPlayback: videoPlaybackPayload,
    videoPlaybackClient: videoPlaybackClientPayload,
    videoHlsProxy: videoHlsProxyPayload,
    videoTranscode: videoTranscodePayload,
    operatorIncidents: operatorIncidentsPayload,
    backupJobs,
    outgoingDelivery: outgoingDeliveryPayload,
    integratorPushOutbox: integratorPushOutboxPayload,
    remindersPipeline: remindersPipelinePayload,
    webPush: webPushPayload,
    notificationDelivery: notificationDeliveryPayload,
    cronJobs: cronJobsPayload,
    probeOutbound: { consecutiveFailRuns: probeOutboundConsecutiveFailRuns },
    integrations: integrationsPayload,
    operatorHealthDigest: { lastSentAt: operatorHealthDigestLastSentAt },
    saasIsolation: saasIsolationPayload,
    meta: {
      probes: {
        webappDb: {
          status: webappDbResult.ok ? webappDbResult.value : webappDbResult.status,
          durationMs: webappDbResult.durationMs,
          ...(webappDbResult.ok ? {} : { errorCode: webappDbResult.errorCode }),
        },
        integratorApi: {
          status: integratorApiResult.ok ? 'ok' : integratorApiResult.status,
          durationMs: integratorApiResult.durationMs,
          ...(integratorApiResult.ok ? {} : { errorCode: integratorApiResult.errorCode }),
        },
        mediaPreview: {
          status: mediaPreviewResult.ok
            ? mediaPreviewResult.value.status
            : mediaPreviewResult.status,
          durationMs: mediaPreviewResult.durationMs,
          ...(mediaPreviewResult.ok ? {} : { errorCode: mediaPreviewResult.errorCode }),
        },
        videoPlayback: {
          status: videoPlaybackResult.ok
            ? videoPlaybackResult.value.status
            : videoPlaybackResult.status,
          durationMs: videoPlaybackResult.durationMs,
          ...(videoPlaybackResult.ok ? {} : { errorCode: videoPlaybackResult.errorCode }),
        },
        videoPlaybackClient: {
          status: videoPlaybackClientResult.ok
            ? videoPlaybackClientResult.value.status
            : videoPlaybackClientResult.status,
          durationMs: videoPlaybackClientResult.durationMs,
          ...(videoPlaybackClientResult.ok
            ? {}
            : { errorCode: videoPlaybackClientResult.errorCode }),
        },
        videoHlsProxy: {
          status: videoHlsProxyResult.ok
            ? videoHlsProxyResult.value.status
            : videoHlsProxyResult.status,
          durationMs: videoHlsProxyResult.durationMs,
          ...(videoHlsProxyResult.ok ? {} : { errorCode: videoHlsProxyResult.errorCode }),
        },
        videoTranscode: {
          status: videoTranscodeResult.ok
            ? videoTranscodeResult.value.status
            : videoTranscodeResult.status,
          durationMs: videoTranscodeResult.durationMs,
          ...(videoTranscodeResult.ok ? {} : { errorCode: videoTranscodeResult.errorCode }),
        },
        operatorIncidents: {
          status: operatorIncidentsProbeStatus,
          durationMs: curatedResult.durationMs,
          ...(!curatedResult.ok ? { errorCode: curatedResult.errorCode } : {}),
        },
        operatorBackupJobs: {
          status: backupJobsProbeStatus,
          durationMs: curatedResult.durationMs,
          ...(!curatedResult.ok ? { errorCode: curatedResult.errorCode } : {}),
        },
        outgoingDelivery: {
          status: outgoingDeliveryProbeStatus,
          durationMs: curatedResult.durationMs,
          ...(!curatedResult.ok ? { errorCode: curatedResult.errorCode } : {}),
        },
        integratorPushOutbox: {
          status: integratorPushOutboxProbeStatus,
          durationMs: curatedResult.durationMs,
          ...(!curatedResult.ok ? { errorCode: curatedResult.errorCode } : {}),
        },
        remindersPipeline: {
          status: remindersPipelineResult.ok ? 'ok' : 'error',
          durationMs: remindersPipelineDurationMs,
          ...(!remindersPipelineResult.ok ? { errorCode: remindersPipelineResult.errorCode } : {}),
        },
        webPush: {
          status: webPushResult.ok ? webPushPayload.status : 'error',
          durationMs: webPushDurationMs,
          ...(!webPushResult.ok ? { errorCode: webPushResult.errorCode } : {}),
        },
        notificationDelivery: {
          status: notificationDeliveryResult.ok ? notificationDeliveryPayload.status : 'error',
          durationMs: notificationDeliveryDurationMs,
          ...(!notificationDeliveryResult.ok
            ? { errorCode: notificationDeliveryResult.errorCode }
            : {}),
        },
        cronJobs: {
          status: cronJobsProbeStatus,
          durationMs: cronJobsDurationMs,
          ...(!curatedResult.ok ? { errorCode: curatedResult.errorCode } : {}),
        },
        saasIsolation: {
          status: saasIsolationResult.ok ? saasIsolationPayload.status : saasIsolationResult.status,
          durationMs: saasIsolationResult.durationMs,
          ...(!saasIsolationResult.ok ? { errorCode: saasIsolationResult.errorCode } : {}),
        },
      },
    },
    fetchedAt: nowIso(),
  };

  logProbe('webapp_db', webappDbResult, response.webappDb);
  logProbe('integrator_api', integratorApiResult, response.integratorApi.status);
  logProbe('media_preview', mediaPreviewResult, response.mediaPreview.status);
  logProbe('video_playback', videoPlaybackResult, response.videoPlayback.status);
  logProbe('video_playback_client', videoPlaybackClientResult, response.videoPlaybackClient.status);
  logProbe('video_hls_proxy', videoHlsProxyResult, response.videoHlsProxy.status);
  logProbe('video_transcode', videoTranscodeResult, response.videoTranscode.status);
  logProbe('operator_incidents', curatedResult, operatorIncidentsProbeStatus);
  logProbe('operator_backup_jobs', curatedResult, backupJobsProbeStatus);
  logProbe('outgoing_delivery', curatedResult, outgoingDeliveryProbeStatus);
  logProbe('integrator_push_outbox', curatedResult, integratorPushOutboxProbeStatus);
  logProbe(
    'reminders_pipeline',
    remindersPipelineResult.ok
      ? { ok: true, value: remindersPipelinePayload, durationMs: remindersPipelineDurationMs }
      : {
          ok: false,
          status: 'error',
          errorCode: remindersPipelineResult.errorCode,
          durationMs: remindersPipelineDurationMs,
        },
  );
  logProbe(
    'web_push',
    webPushResult.ok
      ? { ok: true, value: webPushPayload, durationMs: webPushDurationMs }
      : {
          ok: false,
          status: 'error',
          errorCode: webPushResult.errorCode,
          durationMs: webPushDurationMs,
        },
  );
  logProbe(
    'cron_jobs',
    curatedResult.ok
      ? { ok: true, value: cronJobsPayload, durationMs: cronJobsDurationMs }
      : {
          ok: false,
          status: 'error',
          errorCode: curatedResult.errorCode,
          durationMs: cronJobsDurationMs,
        },
    cronJobsProbeStatus,
  );
  logProbe(
    'notification_delivery',
    notificationDeliveryResult.ok
      ? { ok: true, value: notificationDeliveryPayload, durationMs: notificationDeliveryDurationMs }
      : {
          ok: false,
          status: 'error',
          errorCode: notificationDeliveryResult.errorCode,
          durationMs: notificationDeliveryDurationMs,
        },
    notificationDeliveryPayload.status,
  );
  logProbe('saas_isolation', saasIsolationResult, saasIsolationPayload.status);

  return response;
}
