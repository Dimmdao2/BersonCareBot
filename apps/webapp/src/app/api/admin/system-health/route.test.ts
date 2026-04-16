import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminModeSessionMock,
  checkDbHealthMock,
  proxyIntegratorProjectionHealthMock,
  loggerInfoMock,
  loggerWarnMock,
  envMock,
  isS3MediaEnabledMock,
  poolQueryMock,
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
}));

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

vi.mock("@/infra/health/proxyIntegratorProjectionHealth", () => ({
  proxyIntegratorProjectionHealth: proxyIntegratorProjectionHealthMock,
}));

vi.mock("@/infra/logging/logger", () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
  },
}));

vi.mock("@/config/env", () => ({
  env: envMock,
  isS3MediaEnabled: isS3MediaEnabledMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({
    query: poolQueryMock,
  })),
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
    poolQueryMock.mockReset();
    poolQueryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ stale_pending_count: "0" }] });
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
      meta?: { probes?: { projection?: { status: string; durationMs: number } } };
      fetchedAt: string;
    };
    expect(body.webappDb).toBe("up");
    expect(body.integratorApi).toEqual({ status: "ok", db: "up" });
    expect(body.projection.status).toBe("degraded");
    expect(body.projection.snapshot?.deadCount).toBe(1);
    expect(body.meta?.probes?.projection?.status).toBe("degraded");
    expect(typeof body.meta?.probes?.projection?.durationMs).toBe("number");
    expect(typeof body.fetchedAt).toBe("string");
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
  });
});
