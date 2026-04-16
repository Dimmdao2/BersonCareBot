import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { logger } from "@/infra/logging/logger";
import { proxyIntegratorProjectionHealth } from "@/infra/health/proxyIntegratorProjectionHealth";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const INTEGRATOR_TIMEOUT_MS = 8_000;

type DbStatus = "up" | "down";
type IntegratorApiStatus = "ok" | "unreachable" | "error";
type ProjectionStatus = "ok" | "degraded" | "unreachable" | "error";

type ProjectionSnapshot = {
  deadCount?: number;
  retriesOverThreshold?: number;
  lastSuccessAt?: string | null;
} & Record<string, unknown>;

type SystemHealthResponse = {
  webappDb: DbStatus;
  integratorApi: { status: IntegratorApiStatus; db?: DbStatus };
  projection: { status: ProjectionStatus; snapshot?: ProjectionSnapshot };
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

function logProbe(
  probe: "webapp_db" | "integrator_api" | "projection",
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

  const [webappDb, integratorApi, projection] = await Promise.allSettled([
    probeWebappDb(),
    probeIntegratorApi(),
    probeProjection(),
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
    fetchedAt: nowIso(),
  };

  logProbe("webapp_db", webappDbResult, response.webappDb);
  logProbe("integrator_api", integratorApiResult, response.integratorApi.status);
  logProbe("projection", projectionResult, response.projection.status);

  return NextResponse.json(response);
}
