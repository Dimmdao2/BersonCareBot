import { beforeEach, describe, expect, it, vi } from "vitest";

const zeroMetrics = {
  byDelivery: { hls: 0, mp4: 0, file: 0 },
  fallbackTotal: 0,
  totalResolutions: 0,
  uniquePlaybackPairsFirstSeenInWindow: 0,
};

const zeroHlsProxyMetrics = {
  windowHours: 24 as const,
  errorsTotal24h: 0,
  errorsTotal1h: 0,
  byReason: {} as Record<string, number>,
  byReasonLast1h: {} as Record<string, number>,
  degraded: false,
  recent: [] as [],
};

const zeroTranscodeMetrics = {
  pendingCount: 0,
  processingCount: 0,
  doneLastHour: 0,
  failedLastHour: 0,
  doneLast24h: 0,
  failedLast24h: 0,
  doneLifetime: 0,
  failedLifetime: 0,
  avgProcessingMsDoneLastHour: null as number | null,
  oldestPendingAgeSeconds: null as number | null,
  legacyReconcileCandidateCountWithinSizeCap: 0,
  readableVideoReadyWithHlsCount: 0,
};

const zeroOutgoingSnapshot = {
  dueBacklog: 0,
  deadTotal: 0,
  blockedRecipientTotal: 0,
  oldestDueAgeSeconds: null as number | null,
  dueByChannel: {} as Record<string, number>,
  dueByKind: {} as Record<string, number>,
  deadByKind: {} as Record<string, number>,
  processingCount: 0,
  lastSentAt: null as string | null,
  lastQueueActivityAt: null as string | null,
};

const zeroIntegratorPushOutboxSnapshot = {
  dueBacklog: 0,
  deadTotal: 0,
  oldestDueAgeSeconds: null as number | null,
  dueByKind: {} as Record<string, number>,
  deadByKind: {} as Record<string, number>,
  processingCount: 0,
  oldestProcessingAgeSeconds: null as number | null,
  lastQueueActivityAt: null as string | null,
};

const {
  requireAdminModeSessionMock,
  checkDbHealthMock,
  proxyIntegratorProjectionHealthMock,
  loggerInfoMock,
  loggerWarnMock,
  envMock,
  isS3MediaEnabledMock,
  poolQueryMock,
  getConfigBoolMock,
  loadCuratedPlaybackHealthSnapshotMock,
  loadAdminTranscodeHealthMetricsMock,
  listOpenIncidentsMock,
  listBackupJobStatusMock,
  getOutgoingDeliveryQueueHealthMock,
  getIntegratorPushOutboxHealthMock,
  getOperatorJobStatusMock,
  listIntegrationWebhookLastStatusMock,
  loadAdminReminderPipelineMetricsMock,
  loadCuratedSystemHealthSnapshotMock,
  readSaasIsolationHealthMock,
} = vi.hoisted(() => ({
  requireAdminModeSessionMock: vi.fn(),
  checkDbHealthMock: vi.fn(),
  proxyIntegratorProjectionHealthMock: vi.fn(),
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  envMock: {
    INTEGRATOR_API_URL: "http://integrator.test",
    INTERNAL_JOB_SECRET: "secret",
  },
  isS3MediaEnabledMock: vi.fn(),
  poolQueryMock: vi.fn(),
  getConfigBoolMock: vi.fn(),
  loadCuratedPlaybackHealthSnapshotMock: vi.fn(),
  loadAdminTranscodeHealthMetricsMock: vi.fn(),
  listOpenIncidentsMock: vi.fn(),
  listBackupJobStatusMock: vi.fn(),
  getOutgoingDeliveryQueueHealthMock: vi.fn(),
  getIntegratorPushOutboxHealthMock: vi.fn(),
  getOperatorJobStatusMock: vi.fn(),
  listIntegrationWebhookLastStatusMock: vi.fn(),
  loadAdminReminderPipelineMetricsMock: vi.fn(),
  loadCuratedSystemHealthSnapshotMock: vi.fn(),
  readSaasIsolationHealthMock: vi.fn(),
}));

/** Routes SQL by substring — media preview probes run in parallel with playback metrics; order unspecified. */
function mockPoolPreviewOnly() {
  poolQueryMock.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("stale_pending_count")) {
      return Promise.resolve({ rows: [{ stale_pending_count: "0" }] });
    }
    if (typeof sql === "string" && sql.includes("INSERT INTO admin_audit_log")) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    return Promise.resolve({ rows: [] });
  });
}

vi.mock("@/modules/auth/requireAdminMode", () => ({
  requireAdminModeSession: requireAdminModeSessionMock,
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: vi.fn(() => ({
    health: {
      checkDbHealth: checkDbHealthMock,
    },
    operatorHealthRead: {
      listOpenIncidents: listOpenIncidentsMock,
      listBackupJobStatus: listBackupJobStatusMock,
      getOperatorJobStatus: getOperatorJobStatusMock,
      getOutgoingDeliveryQueueHealth: getOutgoingDeliveryQueueHealthMock,
      getIntegratorPushOutboxHealth: getIntegratorPushOutboxHealthMock,
      listIntegrationWebhookLastStatus: listIntegrationWebhookLastStatusMock,
    },
    saasIsolationDiagnostics: {
      readHealth: readSaasIsolationHealthMock,
    },
  })),
}));

vi.mock("@/app-layer/health/proxyIntegratorProjectionHealth", () => ({
  proxyIntegratorProjectionHealth: proxyIntegratorProjectionHealthMock,
}));

vi.mock("@/app-layer/logging/logger", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
  },
}));

vi.mock("@/config/env", () => ({
  env: envMock,
  isS3MediaEnabled: isS3MediaEnabledMock,
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: vi.fn(() => ({
    query: poolQueryMock,
  })),
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: getConfigBoolMock,
}));

vi.mock("@/app-layer/media/adminPlaybackHealthMetrics", () => ({
  ADMIN_PLAYBACK_METRICS_WINDOW_HOURS: 24,
}));

vi.mock("@/app-layer/media/adminHlsProxyHealthMetrics", () => ({
  ADMIN_HLS_PROXY_METRICS_WINDOW_HOURS: 24,
}));

vi.mock("@/app-layer/media/adminTranscodeHealthMetrics", () => ({
  loadAdminTranscodeHealthMetrics: loadAdminTranscodeHealthMetricsMock,
}));

vi.mock("@/app-layer/health/adminReminderPipelineMetrics", () => ({
  loadAdminReminderPipelineMetrics: loadAdminReminderPipelineMetricsMock,
  emptyRemindersPipelineHealthPayload: () => ({
    windowHours: 24,
    outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
    occurrenceHistory: { sent: 0, failed: 0 },
    deliveryEvents: { sent: 0, failed: 0 },
    patientReminderM2mIdempotencyKeysActive: 0,
  }),
}));

vi.mock("@/infra/repos/pgCuratedSystemHealthDiagnostics", () => ({
  loadCuratedSystemHealthSnapshot: loadCuratedSystemHealthSnapshotMock,
  loadCuratedPlaybackHealthSnapshot: loadCuratedPlaybackHealthSnapshotMock,
}));

import { GET } from "./route";
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
  OPERATOR_REMINDERS_JOB_FAMILY,
  OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

describe("GET /api/admin/system-health", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    requireAdminModeSessionMock.mockReset();
    checkDbHealthMock.mockReset();
    proxyIntegratorProjectionHealthMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    envMock.INTEGRATOR_API_URL = "http://integrator.test";
    envMock.INTERNAL_JOB_SECRET = "secret";
    isS3MediaEnabledMock.mockReturnValue(true);
    getConfigBoolMock.mockReset();
    getConfigBoolMock.mockResolvedValue(false);
    poolQueryMock.mockReset();
    mockPoolPreviewOnly();
    loadCuratedPlaybackHealthSnapshotMock.mockReset();
    loadCuratedPlaybackHealthSnapshotMock.mockResolvedValue({
      "24": zeroMetrics,
      "1": zeroMetrics,
      hlsProxy: zeroHlsProxyMetrics,
    });
    loadAdminTranscodeHealthMetricsMock.mockReset();
    loadAdminTranscodeHealthMetricsMock.mockResolvedValue(zeroTranscodeMetrics);
    listOpenIncidentsMock.mockReset();
    listBackupJobStatusMock.mockReset();
    getOutgoingDeliveryQueueHealthMock.mockReset();
    getIntegratorPushOutboxHealthMock.mockReset();
    getOperatorJobStatusMock.mockReset();
    loadAdminReminderPipelineMetricsMock.mockReset();
    loadCuratedSystemHealthSnapshotMock.mockReset();
    readSaasIsolationHealthMock.mockReset();
    listOpenIncidentsMock.mockResolvedValue([]);
    listBackupJobStatusMock.mockResolvedValue([]);
    getOutgoingDeliveryQueueHealthMock.mockResolvedValue({ ...zeroOutgoingSnapshot });
    getIntegratorPushOutboxHealthMock.mockResolvedValue({ ...zeroIntegratorPushOutboxSnapshot });
    getOperatorJobStatusMock.mockResolvedValue(null);
    listIntegrationWebhookLastStatusMock.mockResolvedValue([]);
    loadAdminReminderPipelineMetricsMock.mockResolvedValue({
      ok: true,
      value: {
        windowHours: 24,
        outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
        occurrenceHistory: { sent: 0, failed: 0 },
        deliveryEvents: { sent: 0, failed: 0 },
        patientReminderM2mIdempotencyKeysActive: 0,
      },
    });
    loadCuratedSystemHealthSnapshotMock.mockImplementation(async () => {
      const [transcode, incidents, backups, outgoing, pushOutbox, reminderResult] = await Promise.all([
        loadAdminTranscodeHealthMetricsMock(),
        listOpenIncidentsMock(20),
        listBackupJobStatusMock(),
        getOutgoingDeliveryQueueHealthMock(),
        getIntegratorPushOutboxHealthMock(),
        loadAdminReminderPipelineMetricsMock(zeroOutgoingSnapshot),
      ]);
      const requestedJobs = [
        [OPERATOR_MEDIA_JOB_FAMILY, OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY],
        [OPERATOR_REMINDERS_JOB_FAMILY, OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY],
      ] as const;
      const jobs = (await Promise.all(
        requestedJobs.map(([family, key]) => getOperatorJobStatusMock(family, key)),
      )).filter((row): row is NonNullable<typeof row> => row != null);
      const pipelineEnabled = Boolean(await getConfigBoolMock("video_hls_pipeline_enabled", false));
      const reconcileEnabled = Boolean(await getConfigBoolMock("video_hls_reconcile_enabled", false));
      const playbackEnabled = Boolean(await getConfigBoolMock("video_playback_api_enabled", false));
      return {
        schemaVersion: 1,
        config: {
          pipelineEnabled,
          reconcileEnabled,
          playbackEnabled,
          vapidConfigured: false,
          smtpConfigured: false,
        },
        videoTranscode: transcode,
        mediaPreview: {
          stalePendingCount: 0,
          byMimeAndStatus: {
            "video/quicktime": { pending: 0, ready: 0, failed: 0, skipped: 0 },
            "image/heic": { pending: 0, ready: 0, failed: 0, skipped: 0 },
            "image/heif": { pending: 0, ready: 0, failed: 0, skipped: 0 },
          },
        },
        videoPlaybackClient: {
          windowHours: 24,
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
        },
        operatorJobs: [
          ...jobs.map((job) => ({
            jobKey: job.jobKey,
            jobFamily: job.jobFamily,
            lastStatus: job.lastStatus,
            lastFinishedAt: job.lastFinishedAt ?? null,
            lastSuccessAt: job.lastSuccessAt ?? null,
            lastFailureAt: job.lastFailureAt ?? null,
            lastDurationMs: job.lastDurationMs ?? null,
            safeMeta: job.metaJson ?? {},
          })),
          ...backups.map((job: {
            jobKey: string;
            jobFamily: string;
            lastStatus: string;
            lastFinishedAt?: string | null;
            lastSuccessAt?: string | null;
            lastFailureAt?: string | null;
            lastDurationMs?: number | null;
          }) => ({
            jobKey: job.jobKey,
            jobFamily: job.jobFamily,
            lastStatus: job.lastStatus,
            lastFinishedAt: job.lastFinishedAt ?? null,
            lastSuccessAt: job.lastSuccessAt ?? null,
            lastFailureAt: job.lastFailureAt ?? null,
            lastDurationMs: job.lastDurationMs ?? null,
            safeMeta: {},
          })),
        ],
        operatorIncidents: {
          openCount: incidents.length,
          occurrenceCount: incidents.reduce(
            (sum: number, row: { occurrenceCount?: number }) => sum + (row.occurrenceCount ?? 0),
            0,
          ),
          lastSeenAt: incidents[0]?.lastSeenAt ?? null,
        },
        outgoingDelivery: { ...outgoing, reminderProcessingCount: 0 },
        integratorPushOutbox: pushOutbox,
        remindersPipeline: reminderResult.ok
          ? reminderResult.value
          : {
              windowHours: 24,
              outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
              occurrenceHistory: { sent: 0, failed: 0 },
              deliveryEvents: { sent: 0, failed: 0 },
              patientReminderM2mIdempotencyKeysActive: 0,
            },
        webPush: {
          windowHours: 24,
          activeSubscriptionsCount: 0,
          usersWithSubscriptionCount: 0,
          subscriptionsTouchedLast24h: 0,
        },
        notificationDelivery: {
          windowHours: 24,
          totalAttempts24h: 0,
          byChannel: Object.fromEntries(
            ["telegram", "max", "web_push", "email"].map((channel) => [channel, {
              successCount: 0,
              failedCount: 0,
              skippedCount: 0,
              lastAttemptAt: null,
              lastSuccessAt: null,
              lastErrorAt: null,
              lastErrorReason: null,
              lastErrorMessage: null,
            }]),
          ),
          recentIssues: [],
        },
        integrationWebhookStatus: [],
        operatorHealthDigestLastSentAt: null,
      };
    });
    readSaasIsolationHealthMock.mockResolvedValue({
      schemaVersion: 3,
      status: "okay",
      statusReasons: [],
      active: { unexplained: 0, explained: 0, occurrences: 0 },
      resolved: { unexplained: 0, explained: 0, occurrences: 0 },
      byClass: {},
      events: [],
      lastEventAt: null,
      lastCoverage: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "complete",
        startedAt: "2026-07-15T10:00:00.000Z",
        finishedAt: "2026-07-15T11:00:00.000Z",
        servicesChecked: ["webapp", "integrator", "worker", "scheduler", "media_worker", "cron"],
        checksCount: 12,
        unexpectedErrorsCount: 0,
      },
      coverageFresh: true,
      coverageComplete: true,
      missingServices: [],
      trend: {
        asOf: "2026-07-15T12:00:00.000Z",
        current24Hours: 4,
        previous24Hours: 2,
        delta: 2,
        daily7Days: [
          { date: "2026-07-09", count: 0 }, { date: "2026-07-10", count: 0 },
          { date: "2026-07-11", count: 1 }, { date: "2026-07-12", count: 0 },
          { date: "2026-07-13", count: 2 }, { date: "2026-07-14", count: 2 },
          { date: "2026-07-15", count: 4 },
        ],
      },
    });
    globalThis.fetch = originalFetch;
  });

  it("returns guard response when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
    expect(loadCuratedSystemHealthSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns normalized healthy payload with projection degraded", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 5,
          deadCount: 1,
          retriesOverThreshold: 0,
          lastSuccessAt: "2026-04-16T08:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      webappDb: string;
      integratorApi: { status: string; db?: string };
      projection: { status: string; snapshot?: { deadCount?: number } };
      videoPlayback: {
        status: string;
        windowHours: number;
        playbackApiEnabled: boolean;
        totalResolutions: number;
        uniquePlaybackPairsFirstSeenInWindow: number;
      };
      videoTranscode: {
        status: string;
        pendingCount: number;
      };
      operatorIncidents: { openCount: number; occurrenceCount: number; lastSeenAt: string | null };
      backupJobs: Record<string, unknown>;
      outgoingDelivery: typeof zeroOutgoingSnapshot;
      integratorPushOutbox: typeof zeroIntegratorPushOutboxSnapshot;
      remindersPipeline: {
        windowHours: number;
        outgoingReminderDispatch: { due: number; dead: number; processing: number };
        occurrenceHistory: { sent: number; failed: number };
        deliveryEvents: { sent: number; failed: number };
        patientReminderM2mIdempotencyKeysActive: number;
      };
      cronJobs: { status: string; jobs: Array<{ id: string; jobKey: string }> };
      saasIsolation: { schemaVersion: number; status: string; active: { unexplained: number } };
      meta?: {
        probes?: {
          projection?: { status: string; durationMs: number };
          videoPlayback?: { status: string; durationMs: number };
          videoTranscode?: { status: string; durationMs: number };
          operatorIncidents?: { status: string; durationMs: number; errorCode?: string };
          operatorBackupJobs?: { status: string; durationMs: number; errorCode?: string };
          outgoingDelivery?: { status: string; durationMs: number; errorCode?: string };
          integratorPushOutbox?: { status: string; durationMs: number; errorCode?: string };
          remindersPipeline?: { status: string; durationMs: number; errorCode?: string };
          cronJobs?: { status: string; durationMs: number; errorCode?: string };
          saasIsolation?: { status: string; durationMs: number; errorCode?: string };
        };
      };
      fetchedAt: string;
    };
    expect(loadCuratedPlaybackHealthSnapshotMock).not.toHaveBeenCalled();
    expect(body.webappDb).toBe("up");
    expect(body.integratorApi).toEqual({ status: "ok", db: "up" });
    expect(body.projection.status).toBe("degraded");
    expect(body.projection.snapshot?.deadCount).toBe(1);
    expect((body as { integrations?: { rubitime: { outbound: { status: string } } } }).integrations?.rubitime.outbound.status).toBe(
      "no_data",
    );
    expect(body.meta?.probes?.projection?.status).toBe("degraded");
    expect(typeof body.meta?.probes?.projection?.durationMs).toBe("number");
    expect(typeof body.fetchedAt).toBe("string");
    expect(body.videoPlayback.status).toBe("ok");
    expect(body.videoPlayback.windowHours).toBe(24);
    expect(body.videoPlayback.playbackApiEnabled).toBe(false);
    expect(body.videoPlayback.totalResolutions).toBe(0);
    expect(body.videoPlayback.uniquePlaybackPairsFirstSeenInWindow).toBe(0);
    expect(body.meta?.probes?.videoPlayback?.status).toBe("ok");
    expect(body.videoTranscode.status).toBe("ok");
    expect(body.videoTranscode.pendingCount).toBe(0);
    expect(body.meta?.probes?.videoTranscode?.status).toBe("ok");
    expect(body.operatorIncidents).toEqual({ openCount: 0, occurrenceCount: 0, lastSeenAt: null });
    expect(body.backupJobs).toEqual({});
    expect(body.outgoingDelivery).toEqual(zeroOutgoingSnapshot);
    expect(body.integratorPushOutbox).toEqual(zeroIntegratorPushOutboxSnapshot);
    expect(body.remindersPipeline).toEqual({
      windowHours: 24,
      outgoingReminderDispatch: { due: 0, dead: 0, processing: 0 },
      occurrenceHistory: { sent: 0, failed: 0 },
      deliveryEvents: { sent: 0, failed: 0 },
      patientReminderM2mIdempotencyKeysActive: 0,
    });
    expect(body.meta?.probes?.operatorIncidents?.status).toBe("ok");
    expect(body.meta?.probes?.operatorBackupJobs?.status).toBe("ok");
    expect(body.meta?.probes?.outgoingDelivery?.status).toBe("ok");
    expect(body.meta?.probes?.integratorPushOutbox?.status).toBe("ok");
    expect(body.meta?.probes?.remindersPipeline?.status).toBe("ok");
    expect(loadAdminReminderPipelineMetricsMock).toHaveBeenCalled();
    expect(body.cronJobs.jobs.length).toBeGreaterThan(0);
    expect(body.cronJobs.jobs.some((j) => j.id === "outbound_integration_probes")).toBe(true);
    expect(body.cronJobs.jobs.some((j) => j.id === "playback_retention")).toBe(true);
    expect(body.meta?.probes?.cronJobs?.status).toBeDefined();
    expect(body.saasIsolation).toMatchObject({
      schemaVersion: 3,
      status: "okay",
      coverageComplete: true,
      lastCoverage: { status: "complete", checksCount: 12 },
      trend: { current24Hours: 4, previous24Hours: 2, delta: 2 },
    });
    expect(body.meta?.probes?.saasIsolation?.status).toBe("okay");
  });

  it("returns integrator unreachable when /health probe fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { integratorApi: { status: string } };
    expect(body.integratorApi.status).toBe("unreachable");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "integrator_api", status: "unreachable" }),
      "system_health_probe",
    );
    expect(loadCuratedPlaybackHealthSnapshotMock).not.toHaveBeenCalled();
  });

  it("returns projection unreachable when proxy returns unreachable error", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "integrator_unreachable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { projection: { status: string; snapshot?: unknown } };
    expect(body.projection.status).toBe("unreachable");
    expect(body.projection.snapshot).toBeUndefined();
    expect(loadCuratedPlaybackHealthSnapshotMock).not.toHaveBeenCalled();
  });

  it("loads videoPlayback through the protected curated aggregate when playback API enabled", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) => key === "video_playback_api_enabled");
    loadCuratedPlaybackHealthSnapshotMock.mockResolvedValue({
      "24": {
        ...zeroMetrics,
        byDelivery: { hls: 3, mp4: 2, file: 1 },
        fallbackTotal: 3,
        totalResolutions: 6,
        uniquePlaybackPairsFirstSeenInWindow: 4,
      },
      "1": zeroMetrics,
      hlsProxy: {
        ...zeroHlsProxyMetrics,
        errorsTotal24h: 2,
        errorsTotal1h: 1,
        byReason: { missing_object: 2 },
        byReasonLast1h: { missing_object: 1 },
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      videoPlayback: {
        byDelivery: { hls: number; mp4: number; file: number };
        fallbackTotal: number;
        totalResolutions: number;
        playbackApiEnabled: boolean;
        uniquePlaybackPairsFirstSeenInWindow: number;
      };
      videoHlsProxy: { errorsTotal24h: number; errorsTotal1h: number };
    };
    expect(loadCuratedPlaybackHealthSnapshotMock).toHaveBeenCalledTimes(1);
    expect(body.videoPlayback.playbackApiEnabled).toBe(true);
    expect(body.videoPlayback.byDelivery).toEqual({ hls: 3, mp4: 2, file: 1 });
    expect(body.videoPlayback.totalResolutions).toBe(6);
    expect(body.videoPlayback.fallbackTotal).toBe(3);
    expect(body.videoPlayback.uniquePlaybackPairsFirstSeenInWindow).toBe(4);
    expect(body.videoHlsProxy).toMatchObject({ errorsTotal24h: 2, errorsTotal1h: 1 });
  });

  it("returns videoPlayback error shell when curated playback aggregate fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) => key === "video_playback_api_enabled");
    loadCuratedPlaybackHealthSnapshotMock.mockRejectedValue(new Error("aggregate_down"));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      videoPlayback: { status: string; totalResolutions: number; playbackApiEnabled: boolean };
      meta?: { probes?: { videoPlayback?: { status?: string; errorCode?: string } } };
    };
    expect(body.videoPlayback.status).toBe("error");
    expect(body.videoPlayback.totalResolutions).toBe(0);
    expect(body.videoPlayback.playbackApiEnabled).toBe(true);
    expect(body.meta?.probes?.videoPlayback?.errorCode).toBe("video_playback_probe_failed");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "video_playback", errorCode: "video_playback_probe_failed" }),
      "system_health_probe",
    );
  });

  it("returns videoTranscode error shell when transcode metrics loader fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) =>
      key === "video_hls_pipeline_enabled" || key === "video_hls_reconcile_enabled" ? true : false,
    );
    loadAdminTranscodeHealthMetricsMock.mockRejectedValue(new Error("drizzle_transcode_down"));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      videoTranscode: {
        status: string;
        pipelineEnabled: boolean;
        reconcileEnabled: boolean;
        pendingCount: number;
      };
      meta?: { probes?: { videoTranscode?: { status?: string; errorCode?: string } } };
    };
    expect(body.videoTranscode.status).toBe("error");
    expect(body.videoTranscode.pipelineEnabled).toBe(false);
    expect(body.videoTranscode.reconcileEnabled).toBe(false);
    expect(body.videoTranscode.pendingCount).toBe(0);
    expect(body.meta?.probes?.videoTranscode?.errorCode).toBe("curated_system_health_read_failed");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "video_transcode", errorCode: "curated_system_health_read_failed" }),
      "system_health_probe",
    );
  });

  it("includes open operator incidents and flags backup job failure in probes", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    listOpenIncidentsMock.mockResolvedValue([
      {
        id: "i1",
        dedupKey: "k1",
        direction: "outbound",
        integration: "max",
        errorClass: "e1",
        errorDetail: "boom",
        openedAt: "2026-04-16T10:00:00.000Z",
        lastSeenAt: "2026-04-16T10:05:00.000Z",
        occurrenceCount: 3,
      },
    ]);
    listBackupJobStatusMock.mockResolvedValue([
      {
        jobKey: "backup.hourly",
        jobFamily: "backup",
        lastStatus: "failure",
        lastStartedAt: null,
        lastFinishedAt: "2026-04-16T10:00:00.000Z",
        lastSuccessAt: null,
        lastFailureAt: "2026-04-16T10:00:00.000Z",
        lastDurationMs: 100,
        lastError: "oops",
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      operatorIncidents: { openCount: number; occurrenceCount: number; lastSeenAt: string | null };
      backupJobs: Record<string, { lastStatus: string }>;
      meta?: { probes?: { operatorIncidents?: { status: string }; operatorBackupJobs?: { status: string } } };
    };
    expect(body.operatorIncidents).toEqual({
      openCount: 1,
      occurrenceCount: 3,
      lastSeenAt: "2026-04-16T10:05:00.000Z",
    });
    expect(body.backupJobs["backup.hourly"]?.lastStatus).toBe("failure");
    expect(body.meta?.probes?.operatorIncidents?.status).toBe("degraded");
    expect(body.meta?.probes?.operatorBackupJobs?.status).toBe("degraded");
  });

  it("returns empty operator payloads when operator health read throws", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    listOpenIncidentsMock.mockRejectedValue(new Error("db_down"));
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      operatorIncidents: { openCount: number; occurrenceCount: number; lastSeenAt: string | null };
      backupJobs: Record<string, unknown>;
      meta?: {
        probes?: {
          operatorIncidents?: { status: string; errorCode?: string };
          operatorBackupJobs?: { status: string; errorCode?: string };
        };
      };
    };
    expect(body.operatorIncidents).toEqual({ openCount: 0, occurrenceCount: 0, lastSeenAt: null });
    expect(body.backupJobs).toEqual({});
    expect(body.meta?.probes?.operatorIncidents?.status).toBe("error");
    expect(body.meta?.probes?.operatorIncidents?.errorCode).toBe("curated_system_health_read_failed");
    expect(body.meta?.probes?.operatorBackupJobs?.status).toBe("error");
  });

  it("includes lastReconcileTick when operator_job_status row exists", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (family === OPERATOR_MEDIA_JOB_FAMILY && key === OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY) {
        return Promise.resolve({
          jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
          jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
          lastStatus: "success",
          lastStartedAt: "2026-01-01T00:00:00.000Z",
          lastFinishedAt: "2026-01-01T00:00:05.000Z",
          lastSuccessAt: "2026-01-01T00:00:05.000Z",
          lastFailureAt: null,
          lastDurationMs: 900,
          lastError: null,
          metaJson: { queuedNew: 2 },
        });
      }
      return Promise.resolve(null);
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      videoTranscode: {
        lastReconcileTick: { metaJson: Record<string, unknown>; lastStatus: string } | null;
      };
    };
    expect(body.videoTranscode.lastReconcileTick?.lastStatus).toBe("success");
    expect(body.videoTranscode.lastReconcileTick?.metaJson?.queuedNew).toBe(2);
    expect(getOperatorJobStatusMock).toHaveBeenCalledWith(
      OPERATOR_MEDIA_JOB_FAMILY,
      OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
    );
  });

  it("returns videoTranscode degraded when reconcile last tick is failure", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) =>
      key === "video_hls_pipeline_enabled" || key === "video_hls_reconcile_enabled" ? true : false,
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    loadAdminTranscodeHealthMetricsMock.mockResolvedValue(zeroTranscodeMetrics);
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (family === OPERATOR_MEDIA_JOB_FAMILY && key === OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY) {
        return Promise.resolve({
          jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
          jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
          lastStatus: "failure",
          lastStartedAt: "2026-01-01T00:00:00.000Z",
          lastFinishedAt: "2026-01-01T00:00:05.000Z",
          lastSuccessAt: null,
          lastFailureAt: "2026-01-01T00:00:05.000Z",
          lastDurationMs: 900,
          lastError: "cron failed",
          metaJson: {},
        });
      }
      return Promise.resolve(null);
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      videoTranscode: { status: string };
      meta?: { probes?: { videoTranscode?: { status: string } } };
    };
    expect(body.videoTranscode.status).toBe("degraded");
    expect(body.meta?.probes?.videoTranscode?.status).toBe("degraded");
  });

  it("returns videoTranscode error when oldest pending exceeds 60 min", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) =>
      key === "video_hls_pipeline_enabled" || key === "video_hls_reconcile_enabled" ? true : false,
    );
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    loadAdminTranscodeHealthMetricsMock.mockResolvedValue({
      ...zeroTranscodeMetrics,
      pendingCount: 2,
      oldestPendingAgeSeconds: 61 * 60,
    });
    getOperatorJobStatusMock.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { videoTranscode: { status: string } };
    expect(body.videoTranscode.status).toBe("error");
  });

  it("returns webPushOnlyReminderTick ok when last success is fresh", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const freshSuccess = new Date().toISOString();
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (family === OPERATOR_REMINDERS_JOB_FAMILY && key === OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY) {
        return Promise.resolve({
          jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
          jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
          lastStatus: "success",
          lastStartedAt: freshSuccess,
          lastFinishedAt: freshSuccess,
          lastSuccessAt: freshSuccess,
          lastFailureAt: null,
          lastDurationMs: 120,
          lastError: null,
          metaJson: { rulesFound: 1, sent: 0, failed: 0 },
        });
      }
      return Promise.resolve(null);
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      webPushOnlyReminderTick: { status: string; lastTick: { metaJson: Record<string, unknown> } | null };
      meta?: { probes?: { webPushOnlyReminderTick?: { status: string } } };
    };
    expect(body.webPushOnlyReminderTick.status).toBe("ok");
    expect(body.webPushOnlyReminderTick.lastTick?.metaJson?.rulesFound).toBe(1);
    expect(body.meta?.probes?.webPushOnlyReminderTick?.status).toBe("ok");
    expect(getOperatorJobStatusMock).toHaveBeenCalledWith(
      OPERATOR_REMINDERS_JOB_FAMILY,
      OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
    );
  });

  it("returns webPushOnlyReminderTick degraded when last success is stale", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const staleSuccess = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (family === OPERATOR_REMINDERS_JOB_FAMILY && key === OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY) {
        return Promise.resolve({
          jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
          jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
          lastStatus: "success",
          lastStartedAt: staleSuccess,
          lastFinishedAt: staleSuccess,
          lastSuccessAt: staleSuccess,
          lastFailureAt: null,
          lastDurationMs: 50,
          lastError: null,
          metaJson: {},
        });
      }
      return Promise.resolve(null);
    });

    const res = await GET();
    const body = (await res.json()) as { webPushOnlyReminderTick: { status: string } };
    expect(body.webPushOnlyReminderTick.status).toBe("degraded");
  });

  it("returns webPushOnlyReminderTick error when last cron tick status is failure", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, db: "up" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;
    proxyIntegratorProjectionHealthMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          pendingCount: 0,
          deadCount: 0,
          retriesOverThreshold: 0,
          lastSuccessAt: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (family === OPERATOR_REMINDERS_JOB_FAMILY && key === OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY) {
        return Promise.resolve({
          jobKey: OPERATOR_WEB_PUSH_ONLY_REMINDER_TICK_JOB_KEY,
          jobFamily: OPERATOR_REMINDERS_JOB_FAMILY,
          lastStatus: "failure",
          lastStartedAt: "2026-01-01T00:00:00.000Z",
          lastFinishedAt: "2026-01-01T00:00:05.000Z",
          lastSuccessAt: "2025-12-31T00:00:00.000Z",
          lastFailureAt: "2026-01-01T00:00:05.000Z",
          lastDurationMs: 50,
          lastError: "tick_failed",
          metaJson: { consecutiveCronFailures: 1 },
        });
      }
      return Promise.resolve(null);
    });

    const res = await GET();
    const body = (await res.json()) as {
      webPushOnlyReminderTick: { status: string; lastTick: { lastStatus: string } | null };
      meta?: { probes?: { webPushOnlyReminderTick?: { status: string } } };
    };
    expect(body.webPushOnlyReminderTick.status).toBe("error");
    expect(body.webPushOnlyReminderTick.lastTick?.lastStatus).toBe("failure");
    expect(body.meta?.probes?.webPushOnlyReminderTick?.status).toBe("error");
  });
});
