import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { readHeartbeatVerdict, recordHeartbeatPing } from "@/app-layer/operator-health/heartbeatReceiver";

/**
 * Локальный приёмник пульса «суточная сводка» (design D-d).
 *
 * Это НЕ замена внешнему сервису. Это приёмник, который мы контролируем, чтобы механизм
 * работал целиком уже сейчас и чтобы `OPERATOR_HEARTBEAT_DIGEST_URL` можно было позже
 * перевести на healthchecks-подобный сервис без изменения кода. В проде приёмник ОБЯЗАН
 * быть внешним: пульс, который излучает и принимает одна и та же коробка, ничего не
 * доказывает — это ошибка GitLab 2017-01-31, где канал алертов совпал с отказавшим каналом.
 *
 * POST — записать пульс. GET — прочитать вердикт (жив / пропал / не приходил ни разу).
 */

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(request: Request): NextResponse | null {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return recordHeartbeatPing("digest");
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return readHeartbeatVerdict("digest");
}
