import { NextResponse } from "next/server";
import { env } from "@/config/env";

const TIMEOUT_MS = 10_000;

/**
 * Проксирует `GET {INTEGRATOR_API_URL}/health/projection` (очередь `projection_outbox` в БД integrator).
 * Нужен, чтобы с домена webapp были те же проверки, что на хосте integrator (см. `apps/integrator/src/app/routes.ts`).
 */
export async function proxyIntegratorProjectionHealth(): Promise<NextResponse> {
  const base = (env.INTEGRATOR_API_URL ?? "").replace(/\/$/, "");
  if (!base) {
    return NextResponse.json({ error: "integrator_url_not_configured" }, { status: 503 });
  }
  const url = `${base}/health/projection`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data: unknown = await res.json().catch(() => null);
    if (data === null || typeof data !== "object") {
      return NextResponse.json({ error: "invalid_integrator_response" }, { status: 502 });
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "integrator_unreachable" }, { status: 503 });
  }
}
