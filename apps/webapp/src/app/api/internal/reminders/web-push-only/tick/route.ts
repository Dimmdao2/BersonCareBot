import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { logger } from "@/app-layer/logging/logger";
import { runWebPushOnlyReminderInternalTick } from "@/app-layer/reminders/runWebPushOnlyReminderInternalTick";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST — plan + dispatch due Web Push-only reminder occurrences.
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

  let dispatchLimit = 50;
  try {
    const q = new URL(request.url).searchParams.get("limit");
    if (q) dispatchLimit = Number.parseInt(q, 10);
  } catch {
    /* ignore */
  }

  try {
    const result = await runWebPushOnlyReminderInternalTick({
      dispatchLimit: Number.isFinite(dispatchLimit) ? dispatchLimit : 50,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error({ err: e }, "[internal/reminders/web-push-only/tick] failed");
    return NextResponse.json({ ok: false, error: "tick_failed" }, { status: 500 });
  }
}
