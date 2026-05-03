import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env, isS3MediaEnabled } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import {
  ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
  loadAdminPlaybackHealthMetrics,
} from "@/app-layer/media/adminPlaybackHealthMetrics";
import { getPool } from "@/app-layer/db/client";
import { proxyIntegratorProjectionHealth } from "@/app-layer/health/proxyIntegratorProjectionHealth";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import { getConfigBool } from "@/modules/system-settings/configAdapter";

const INTEGRATOR_TIMEOUT_MS = 8_000;

type DbStatus = "up" | "down";
type IntegratorApiStatus = "ok" | "unreachable" | "error";
type ProjectionStatus = "ok" | "degraded" | "unreachable" | "error";

type ProjectionSnapshot = {
  deadCount?: number;
  pendingCount?: number;
  processingCount?: number;
  cancelledCount?: number;
  oldestPendingAt?: string | null;
  retryDistribution?: Record<number, number>;
  retriesOverThreshold?: number;
  lastSuccessAt?: string | null;
} & Record<string, unknown>;

type PreviewStatus = "pending" | "ready" | "failed" | "skipped";
type PreviewMime = "video/quicktime" | "image/heic" | "image/heif";
type MediaPreviewStatus = "ok" | "degraded" | "error";
type MediaPreviewCounters = Record<PreviewMime, Record<PreviewStatus, number>>;

const PREVIEW_STATUSES: PreviewStatus[] = ["pending", "ready", "failed", "skipped"];
const PREVIEW_MIMES: PreviewMime[] = ["video/quicktime", "image/heic", "image/heif"];
const STALE_PENDING_MINUTES = 30;

type VideoPlaybackHealthStatus = "ok" | "error";

type VideoPlaybackHealthPayload = {
  status: VideoPlaybackHealthStatus;
  windowHours: number;
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
};

type SystemHealthResponse = {
  webappDb: DbStatus;
  integratorApi: { status: IntegratorApiStatus; db?: DbStatus };
  projection: { status: ProjectionStatus; snapshot?: ProjectionSnapshot };
  mediaCronWorkers: { status: "configured" | "not_configured" };
  mediaPreview: {
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  };
  /** VIDEO_HLS_DELIVERY: hourly aggregates of playback resolutions (UTC buckets), last `windowHours`. */
  videoPlayback: VideoPlaybackHealthPayload;
  meta: {
    probes: {
      webappDb: { status: string; durationMs: number; errorCode?: string };
      integratorApi: { status: string; durationMs: number; errorCode?: string };
      projection: { status: string; durationMs: number; errorCode?: string };
      mediaPreview: { status: string; durationMs: number; errorCode?: string };
      videoPlayback: { status: string; durationMs: number; errorCode?: string };
    };
  };
  fetchedAt: string;
};

type ProbeResult<T> =
  | { ok: true; value: T; durationMs: number }
  | { ok: false; status: "unreachable" | "error"; errorCode: string; durationMs: number };

function nowIso(): string {
  return new Date().toISOString();
}

function elapsedMs(start: number): number {
  return Math.max(0, Date.now() - start);
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function toDbStatus(value: unknown): DbStatus | undefined {
  return value === "up" || value === "down" ? value : undefined;
}

function toProjectionStatus(snapshot: ProjectionSnapshot): ProjectionStatus {
  const deadCount = typeof snapshot.deadCount === "number" ? snapshot.deadCount : 0;
  const retriesOverThreshold =
    typeof snapshot.retriesOverThreshold === "number" ? snapshot.retriesOverThreshold : 0;
  return deadCount > 0 || retriesOverThreshold > 0 ? "degraded" : "ok";
}

async function probeWebappDb(): Promise<ProbeResult<DbStatus>> {
  const startedAt = Date.now();
  try {
    const dbOk = await buildAppDeps().health.checkDbHealth();
    return { ok: true, value: dbOk ? "up" : "down", durationMs: elapsedMs(startedAt) };
  } catch {
    return {
      ok: false,
      status: "error",
      errorCode: "webapp_db_check_failed",
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeIntegratorApi(): Promise<ProbeResult<{ status: "ok"; db?: DbStatus }>> {
  const startedAt = Date.now();
  const base = (env.INTEGRATOR_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return {
      ok: false,
      status: "error",
      errorCode: "integrator_url_not_configured",
      durationMs: elapsedMs(startedAt),
    };
  }

  try {
    const res = await fetch(`${base}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(INTEGRATOR_TIMEOUT_MS),
    });
    const body = asObject(await res.json().catch(() => null));
    if (res.ok && body?.ok === true) {
      return {
        ok: true,
        value: { status: "ok", db: toDbStatus(body.db) },
        durationMs: elapsedMs(startedAt),
      };
    }
    return {
      ok: false,
      status: "error",
      errorCode: "integrator_health_non_ok",
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: "unreachable",
      errorCode: "integrator_health_unreachable",
      durationMs: elapsedMs(startedAt),
    };
  }
}

async function probeProjection(): Promise<ProbeResult<{ status: ProjectionStatus; snapshot?: ProjectionSnapshot }>> {
  const startedAt = Date.now();
  try {
    const response = await proxyIntegratorProjectionHealth();
    const payload = asObject(await response.json().catch(() => null));
    if (payload == null) {
      return {
        ok: false,
        status: "error",
        errorCode: "projection_invalid_payload",
        durationMs: elapsedMs(startedAt),
      };
    }
    if (!response.ok) {
      const code = typeof payload.error === "string" ? payload.error : "projection_probe_failed";
      return {
        ok: false,
        status: code.includes("unreachable") ? "unreachable" : "error",
        errorCode: code,
        durationMs: elapsedMs(startedAt),
      };
    }
    const snapshot = payload as ProjectionSnapshot;
    return {
      ok: true,
      value: { status: toProjectionStatus(snapshot), snapshot },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: "error",
      errorCode: "projection_probe_exception",
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

function computeMediaPreviewStatus(counters: MediaPreviewCounters, stalePendingCount: number): MediaPreviewStatus {
  const failedCount = PREVIEW_MIMES.reduce((acc, mime) => acc + counters[mime].failed, 0);
  const pendingCount = PREVIEW_MIMES.reduce((acc, mime) => acc + counters[mime].pending, 0);
  const skippedCount = PREVIEW_MIMES.reduce((acc, mime) => acc + counters[mime].skipped, 0);
  if (failedCount > 0) return "error";
  if (pendingCount > 0 || skippedCount > 0 || stalePendingCount > 0) return "degraded";
  return "ok";
}

async function probeMediaPreview(): Promise<
  ProbeResult<{ status: MediaPreviewStatus; stalePendingCount: number; byMimeAndStatus: MediaPreviewCounters }>
> {
  const startedAt = Date.now();
  try {
    const pool = getPool();
    const [grouped, stale] = await Promise.all([
      pool.query<{ mime_type: string; preview_status: string; cnt: string }>(
        `SELECT mime_type, preview_status, count(*)::text AS cnt
         FROM media_files
         WHERE mime_type = ANY($1::text[])
         GROUP BY mime_type, preview_status`,
        [PREVIEW_MIMES],
      ),
      pool.query<{ stale_pending_count: string }>(
        `SELECT count(*)::text AS stale_pending_count
         FROM media_files
         WHERE mime_type = ANY($1::text[])
           AND preview_status = 'pending'
           AND created_at < now() - ($2::numeric * interval '1 minute')`,
        [PREVIEW_MIMES, STALE_PENDING_MINUTES],
      ),
    ]);

    const counters = initMediaPreviewCounters();
    for (const row of grouped.rows) {
      const mime = PREVIEW_MIMES.find((m) => m === row.mime_type);
      const status = PREVIEW_STATUSES.find((s) => s === row.preview_status);
      if (!mime || !status) continue;
      counters[mime][status] = Number.parseInt(row.cnt, 10) || 0;
    }
    const stalePendingCount = Number.parseInt(stale.rows[0]?.stale_pending_count ?? "0", 10) || 0;
    return {
      ok: true,
      value: {
        status: computeMediaPreviewStatus(counters, stalePendingCount),
        stalePendingCount,
        byMimeAndStatus: counters,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: "error",
      errorCode: "media_preview_probe_failed",
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
    playbackApiEnabled,
    byDelivery: { hls: 0, mp4: 0, file: 0 },
    fallbackTotal: 0,
    totalResolutions: 0,
    uniquePlaybackPairsFirstSeenInWindow: 0,
  };
}

async function probeVideoPlayback(): Promise<ProbeResult<VideoPlaybackHealthPayload>> {
  const startedAt = Date.now();
  try {
    const playbackApiEnabled = await getConfigBool("video_playback_api_enabled", false);
    if (!playbackApiEnabled) {
      return {
        ok: true,
        value: {
          status: "ok",
          windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
          playbackApiEnabled: false,
          byDelivery: { hls: 0, mp4: 0, file: 0 },
          fallbackTotal: 0,
          totalResolutions: 0,
          uniquePlaybackPairsFirstSeenInWindow: 0,
        },
        durationMs: elapsedMs(startedAt),
      };
    }

    const metrics = await loadAdminPlaybackHealthMetrics({
      windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
    });

    return {
      ok: true,
      value: {
        status: "ok",
        windowHours: ADMIN_PLAYBACK_METRICS_WINDOW_HOURS,
        playbackApiEnabled: true,
        byDelivery: metrics.byDelivery,
        fallbackTotal: metrics.fallbackTotal,
        totalResolutions: metrics.totalResolutions,
        uniquePlaybackPairsFirstSeenInWindow: metrics.uniquePlaybackPairsFirstSeenInWindow,
      },
      durationMs: elapsedMs(startedAt),
    };
  } catch {
    return {
      ok: false,
      status: "error",
      errorCode: "video_playback_probe_failed",
      durationMs: elapsedMs(startedAt),
    };
  }
}

function logProbe(
  probe: "webapp_db" | "integrator_api" | "projection" | "media_preview" | "video_playback",
  result: ProbeResult<unknown>,
  statusOverride?: string,
) {
  const status = statusOverride ?? (result.ok ? "ok" : result.status);
  const payload = {
    probe,
    status,
    durationMs: result.durationMs,
    errorCode: result.ok ? undefined : result.errorCode,
  };
  if (result.ok) {
    logger.info(payload, "system_health_probe");
  } else {
    logger.warn(payload, "system_health_probe");
  }
}

export async function GET() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  let playbackApiEnabledFallback = false;
  try {
    playbackApiEnabledFallback = await getConfigBool("video_playback_api_enabled", false);
  } catch {
    /* ignore — videoPlayback payload will still return error shell if probe fails */
  }

  const [webappDb, integratorApi, projection, mediaPreview, videoPlayback] = await Promise.allSettled([
    probeWebappDb(),
    probeIntegratorApi(),
    probeProjection(),
    probeMediaPreview(),
    probeVideoPlayback(),
  ]);

  const webappDbResult: ProbeResult<DbStatus> =
    webappDb.status === "fulfilled"
      ? webappDb.value
      : { ok: false, status: "error", errorCode: "webapp_db_probe_rejected", durationMs: 0 };

  const integratorApiResult: ProbeResult<{ status: "ok"; db?: DbStatus }> =
    integratorApi.status === "fulfilled"
      ? integratorApi.value
      : { ok: false, status: "error", errorCode: "integrator_probe_rejected", durationMs: 0 };

  const projectionResult: ProbeResult<{ status: ProjectionStatus; snapshot?: ProjectionSnapshot }> =
    projection.status === "fulfilled"
      ? projection.value
      : { ok: false, status: "error", errorCode: "projection_probe_rejected", durationMs: 0 };
  const mediaPreviewResult: ProbeResult<{
    status: MediaPreviewStatus;
    stalePendingCount: number;
    byMimeAndStatus: MediaPreviewCounters;
  }> =
    mediaPreview.status === "fulfilled"
      ? mediaPreview.value
      : { ok: false, status: "error", errorCode: "media_preview_probe_rejected", durationMs: 0 };

  const videoPlaybackResult: ProbeResult<VideoPlaybackHealthPayload> =
    videoPlayback.status === "fulfilled"
      ? videoPlayback.value
      : { ok: false, status: "error", errorCode: "video_playback_probe_rejected", durationMs: 0 };

  const videoPlaybackPayload: VideoPlaybackHealthPayload = videoPlaybackResult.ok
    ? videoPlaybackResult.value
    : emptyVideoPlaybackPayload("error", playbackApiEnabledFallback);

  const response: SystemHealthResponse = {
    webappDb: webappDbResult.ok ? webappDbResult.value : "down",
    integratorApi: integratorApiResult.ok
      ? { status: "ok", ...(integratorApiResult.value.db ? { db: integratorApiResult.value.db } : {}) }
      : { status: integratorApiResult.status },
    projection: projectionResult.ok
      ? {
          status: projectionResult.value.status,
          ...(projectionResult.value.snapshot ? { snapshot: projectionResult.value.snapshot } : {}),
        }
      : { status: projectionResult.status },
    mediaCronWorkers: {
      status: env.INTERNAL_JOB_SECRET && isS3MediaEnabled(env) ? "configured" : "not_configured",
    },
    mediaPreview: mediaPreviewResult.ok
      ? mediaPreviewResult.value
      : {
          status: "error",
          stalePendingCount: 0,
          byMimeAndStatus: initMediaPreviewCounters(),
        },
    videoPlayback: videoPlaybackPayload,
    meta: {
      probes: {
        webappDb: {
          status: webappDbResult.ok ? webappDbResult.value : webappDbResult.status,
          durationMs: webappDbResult.durationMs,
          ...(webappDbResult.ok ? {} : { errorCode: webappDbResult.errorCode }),
        },
        integratorApi: {
          status: integratorApiResult.ok ? "ok" : integratorApiResult.status,
          durationMs: integratorApiResult.durationMs,
          ...(integratorApiResult.ok ? {} : { errorCode: integratorApiResult.errorCode }),
        },
        projection: {
          status: projectionResult.ok ? projectionResult.value.status : projectionResult.status,
          durationMs: projectionResult.durationMs,
          ...(projectionResult.ok ? {} : { errorCode: projectionResult.errorCode }),
        },
        mediaPreview: {
          status: mediaPreviewResult.ok ? mediaPreviewResult.value.status : mediaPreviewResult.status,
          durationMs: mediaPreviewResult.durationMs,
          ...(mediaPreviewResult.ok ? {} : { errorCode: mediaPreviewResult.errorCode }),
        },
        videoPlayback: {
          status: videoPlaybackResult.ok ? videoPlaybackResult.value.status : videoPlaybackResult.status,
          durationMs: videoPlaybackResult.durationMs,
          ...(videoPlaybackResult.ok ? {} : { errorCode: videoPlaybackResult.errorCode }),
        },
      },
    },
    fetchedAt: nowIso(),
  };

  logProbe("webapp_db", webappDbResult, response.webappDb);
  logProbe("integrator_api", integratorApiResult, response.integratorApi.status);
  logProbe("projection", projectionResult, response.projection.status);
  logProbe("media_preview", mediaPreviewResult, response.mediaPreview.status);
  logProbe("video_playback", videoPlaybackResult, response.videoPlayback.status);

  return NextResponse.json(response);
}
