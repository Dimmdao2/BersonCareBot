import { beforeEach, describe, expect, it, vi } from "vitest";

const zeroMetrics = {
  byDelivery: { hls: 0, mp4: 0, file: 0 },
  fallbackTotal: 0,
  totalResolutions: 0,
  uniquePlaybackPairsFirstSeenInWindow: 0,
};

const zeroTranscodeMetrics = {
  pendingCount: 0,
  processingCount: 0,
  doneLastHour: 0,
  failedLastHour: 0,
  avgProcessingMsDoneLastHour: null as number | null,
  oldestPendingAgeSeconds: null as number | null,
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
  loadAdminPlaybackHealthMetricsMock,
  loadAdminTranscodeHealthMetricsMock,
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
  loadAdminPlaybackHealthMetricsMock: vi.fn(),
  loadAdminTranscodeHealthMetricsMock: vi.fn(),
}));

/** Routes SQL by substring — media preview probes run in parallel with playback metrics; order unspecified. */
function mockPoolPreviewOnly() {
  poolQueryMock.mockImplementation((sql: string) => {
    if (typeof sql === "string" && sql.includes("stale_pending_count")) {
      return Promise.resolve({ rows: [{ stale_pending_count: "0" }] });
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
  loadAdminPlaybackHealthMetrics: loadAdminPlaybackHealthMetricsMock,
  ADMIN_PLAYBACK_METRICS_WINDOW_HOURS: 24,
}));

vi.mock("@/app-layer/media/adminTranscodeHealthMetrics", () => ({
  loadAdminTranscodeHealthMetrics: loadAdminTranscodeHealthMetricsMock,
}));

import { GET } from "./route";

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
    loadAdminPlaybackHealthMetricsMock.mockReset();
    loadAdminTranscodeHealthMetricsMock.mockReset();
    loadAdminTranscodeHealthMetricsMock.mockResolvedValue(zeroTranscodeMetrics);
    globalThis.fetch = originalFetch;
  });

  it("returns guard response when not admin mode", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 403 }),
    });

    const res = await GET();
    expect(res.status).toBe(403);
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
      meta?: {
        probes?: {
          projection?: { status: string; durationMs: number };
          videoPlayback?: { status: string; durationMs: number };
          videoTranscode?: { status: string; durationMs: number };
        };
      };
      fetchedAt: string;
    };
    expect(loadAdminPlaybackHealthMetricsMock).not.toHaveBeenCalled();
    expect(body.webappDb).toBe("up");
    expect(body.integratorApi).toEqual({ status: "ok", db: "up" });
    expect(body.projection.status).toBe("degraded");
    expect(body.projection.snapshot?.deadCount).toBe(1);
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
    expect(loggerInfoMock).toHaveBeenCalled();
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
    expect(loadAdminPlaybackHealthMetricsMock).not.toHaveBeenCalled();
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
    expect(loadAdminPlaybackHealthMetricsMock).not.toHaveBeenCalled();
  });

  it("loads videoPlayback via Drizzle metrics helper when playback API enabled", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) => key === "video_playback_api_enabled");
    loadAdminPlaybackHealthMetricsMock.mockResolvedValue({
      ...zeroMetrics,
      byDelivery: { hls: 3, mp4: 2, file: 1 },
      fallbackTotal: 3,
      totalResolutions: 6,
      uniquePlaybackPairsFirstSeenInWindow: 4,
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
    };
    expect(loadAdminPlaybackHealthMetricsMock).toHaveBeenCalled();
    expect(loadAdminPlaybackHealthMetricsMock).toHaveBeenCalledWith({ windowHours: 24 });
    expect(loadAdminPlaybackHealthMetricsMock).toHaveBeenCalledWith({ windowHours: 1 });
    expect(body.videoPlayback.playbackApiEnabled).toBe(true);
    expect(body.videoPlayback.byDelivery).toEqual({ hls: 3, mp4: 2, file: 1 });
    expect(body.videoPlayback.totalResolutions).toBe(6);
    expect(body.videoPlayback.fallbackTotal).toBe(3);
    expect(body.videoPlayback.uniquePlaybackPairsFirstSeenInWindow).toBe(4);
  });

  it("returns videoPlayback error shell when Drizzle playback metrics loader fails", async () => {
    requireAdminModeSessionMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: "a1", role: "admin" }, adminMode: true },
    });
    checkDbHealthMock.mockResolvedValue(true);
    getConfigBoolMock.mockImplementation(async (key: string) => key === "video_playback_api_enabled");
    loadAdminPlaybackHealthMetricsMock.mockRejectedValue(new Error("drizzle_down"));
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
    expect(body.videoTranscode.pipelineEnabled).toBe(true);
    expect(body.videoTranscode.reconcileEnabled).toBe(true);
    expect(body.videoTranscode.pendingCount).toBe(0);
    expect(body.meta?.probes?.videoTranscode?.errorCode).toBe("video_transcode_probe_failed");
    expect(loggerWarnMock).toHaveBeenCalledWith(
      expect.objectContaining({ probe: "video_transcode", errorCode: "video_transcode_probe_failed" }),
      "system_health_probe",
    );
  });
});
