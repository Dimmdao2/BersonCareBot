/**
 * POST /api/patient/support — обращение в поддержку.
 * Доступ: сессия пациента; разрешены tier `allow` и onboarding `need_activation`; только `stale_session` → 401.
 *
 * D-2 (night plan 2026-07-26): no longer Telegram-only / no longer 503s when Telegram is
 * unconfigured. Delivery goes through `relaySupportSubmission` → `dispatchOperatorAlert`, the
 * existing multi-channel (telegram/max/web_push/sms), config-driven operator-alert mechanism.
 * A submission is never lost: if no channel confirms delivery it is persisted for the operator
 * to recover (see `persistUndeliveredSupportSubmission`).
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { getCurrentSession } from "@/modules/auth/service";
import { patientClientBusinessGate } from "@/app-layer/platform-access";
import { canAccessPatient } from "@/modules/roles/service";
import { relaySupportSubmission } from "@/app-layer/support/relaySupportSubmission";

const RATE_LIMIT_MS = 60_000;
const lastSupportByRateKey = new Map<string, number>();

const MAX_MESSAGE_LEN = 4000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Только пути приложения; без переводов строк. */
function sanitizeFromAppPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 200);
  if (!t.startsWith("/app")) return null;
  if (/[\r\n\0]/.test(t)) return null;
  return t;
}

function resolveRateLimitKey(
  session: { user: { userId: string; phone?: string | null } },
  h: Headers,
): string {
  const u = session.user.userId?.trim();
  if (u) return `u:${u}`;
  const p = session.user.phone?.trim();
  if (p) return `p:${p}`;
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return ip ? `ip:${ip}` : "anon:support";
}

function buildSupportLines(params: {
  email: string;
  message: string;
  userId: string;
  displayName: string;
  phone: string;
  bindings: { telegramId?: string; maxId?: string; vkId?: string };
  userAgent: string;
  surface: string;
  fromPath: string | null;
}): string[] {
  const b = params.bindings;
  return [
    "Поддержка (webapp)",
    `Email: ${params.email}`,
    `User ID: ${params.userId}`,
    `Имя: ${params.displayName || "—"}`,
    `Телефон: ${params.phone || "—"}`,
    `Поверхность: ${params.surface}`,
    params.fromPath ? `Страница: ${params.fromPath}` : null,
    `User-Agent: ${params.userAgent || "—"}`,
    `Привязки: telegram=${b.telegramId?.trim() ? "да" : "нет"}, max=${b.maxId?.trim() ? "да" : "нет"}, vk=${b.vkId?.trim() ? "да" : "нет"}`,
    b.telegramId?.trim() ? `telegramId: ${b.telegramId.trim()}` : null,
    b.maxId?.trim() ? `maxId: ${b.maxId.trim()}` : null,
    b.vkId?.trim() ? `vkId: ${b.vkId.trim()}` : null,
    "",
    "Сообщение:",
    params.message,
  ].filter((x): x is string => x != null);
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const gate = await patientClientBusinessGate(session);
  if (gate === "stale_session") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    email?: string;
    message?: string;
    surface?: string;
    from?: string;
  } | null;

  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "invalid_email", message: "Укажите корректный email" },
      { status: 400 },
    );
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_message",
        message: `Введите текст сообщения (до ${MAX_MESSAGE_LEN} символов)`,
      },
      { status: 400 },
    );
  }

  const surfaceRaw = typeof body?.surface === "string" ? body.surface.trim().toLowerCase() : "";
  const surface =
    surfaceRaw === "mini_app" ? "mini_app" : surfaceRaw === "browser" ? "browser" : "unknown";

  const fromPath = sanitizeFromAppPath(body?.from);

  const h = await headers();
  const userAgent = (h.get("user-agent") ?? "").slice(0, 500);
  const rateKey = resolveRateLimitKey(session, h);

  const now = Date.now();
  const prev = lastSupportByRateKey.get(rateKey);
  if (prev !== undefined && now - prev < RATE_LIMIT_MS) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const lines = buildSupportLines({
    email,
    message,
    userId: session.user.userId,
    displayName: session.user.displayName ?? "",
    phone: session.user.phone ?? "",
    bindings: session.user.bindings,
    userAgent,
    surface,
    fromPath,
  });

  // D-2: emit via the operator-alert relay (multi-channel, config-driven) instead of a raw
  // Telegram-only call; never lost — see relaySupportSubmission for the fallback contract.
  const messageId = `support:patient:${session.user.userId}:${Date.now()}`;
  const result = await relaySupportSubmission({
    kind: "patient",
    messageId,
    lines,
    email,
    message,
    userId: session.user.userId,
    fromPath,
  });

  lastSupportByRateKey.set(rateKey, Date.now());

  if (!result.delivered) {
    logger.warn(
      { route: "patient/support", persisted: result.persisted },
      "[patient/support] no channel confirmed delivery",
    );
    return NextResponse.json({
      ok: true,
      delivered: false,
      message: "Сообщение получено. Ответим, как только сможем.",
    });
  }

  return NextResponse.json({ ok: true, delivered: true, message: "Сообщение отправлено" });
}
