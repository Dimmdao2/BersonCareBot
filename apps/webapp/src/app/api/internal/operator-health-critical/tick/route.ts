import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { runOperatorHealthCriticalTick } from "@/app-layer/health/runOperatorHealthCriticalTick";
import { recordOperatorCronJobTickBestEffort } from "@/app-layer/operator-health/recordOperatorCronJobTick";
import {
  OPERATOR_HEALTH_JOB_FAMILY,
  OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * POST — critical health tick (матрица §3 → dispatchOperatorAlert).
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

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();

  try {
    const { alerted, keys } = await runOperatorHealthCriticalTick();
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: { alerted, keys },
    });
    return NextResponse.json({ ok: true, alerted, keys });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      jobKey: OPERATOR_HEALTH_CRITICAL_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, "[internal/operator-health-critical/tick] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
