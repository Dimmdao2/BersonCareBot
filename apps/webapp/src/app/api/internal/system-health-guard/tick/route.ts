import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { runIntegratorPushOutboxHealthGuardTick } from "@/app-layer/health/runIntegratorPushOutboxHealthGuardTick";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * POST — проактивная проверка `integrator_push_outbox` и опциональный relay в Telegram/Max
 * (тема `system_health_db_guard` в `admin_incident_alert_config`, по умолчанию выключена).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const { status, alerted } = await runIntegratorPushOutboxHealthGuardTick();
    return NextResponse.json({ ok: true, status, alerted });
  } catch (e) {
    logger.error({ err: e }, "[internal/system-health-guard/tick] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
