/**
 * POST /api/public/support — обращение в поддержку без сессии (экран входа).
 * Rate limit по IP; то же назначение Telegram, что и `/api/patient/support`.
 *
 * S7 (unified-messaging): raw fetch(api.telegram.org) removed; message now emitted via
 * relayOutbound → integrator dispatchPort → redirect-covered chokepoint (D7).
 * Public (no-session) route uses the same M2M relay path (N1 approved — same shared secret,
 * server-to-server).
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { env } from "@/config/env";
import { routePaths } from "@/app-layer/routes/paths";
import { relayOutbound } from "@/modules/messaging/relayOutbound";

const RATE_LIMIT_MS = 60_000;
const lastPublicSupportByKey = new Map<string, number>();

const MAX_MESSAGE_LEN = 4000;
const TELEGRAM_MAX = 4096;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidTelegramAdminChatId(id: number | undefined): id is number {
  return typeof id === "number" && Number.isFinite(id) && id !== 0;
}

function sanitizeFromAppPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 200);
  if (!t.startsWith("/app")) return null;
  if (/[\r\n\0]/.test(t)) return null;
  return t;
}

function publicSupportRateKey(h: Headers): string {
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
  return ip ? `pub:${ip}` : "pub:anon";
}

function buildGuestTelegramText(params: {
  email: string;
  message: string;
  userAgent: string;
  surface: string;
  fromPath: string | null;
}): string {
  const lines = [
    "Поддержка (webapp) — гость, не авторизован",
    `Email: ${params.email}`,
    `Поверхность: ${params.surface}`,
    params.fromPath ? `Страница: ${params.fromPath}` : null,
    `User-Agent: ${params.userAgent || "—"}`,
    "",
    "Сообщение:",
    params.message,
  ].filter((x): x is string => x != null);
  return lines.join("\n");
}

function fitTelegramMessage(text: string): string {
  if (text.length <= TELEGRAM_MAX) return text;
  const marker = "\n…(обрезано)";
  const head = text.slice(0, TELEGRAM_MAX - marker.length);
  return `${head}${marker}`;
}

export async function POST(request: Request) {
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

  const fromPath = sanitizeFromAppPath(body?.from) ?? routePaths.loginContactSupport;

  const h = await headers();
  const userAgent = (h.get("user-agent") ?? "").slice(0, 500);
  const rateKey = publicSupportRateKey(h);

  const now = Date.now();
  const prev = lastPublicSupportByKey.get(rateKey);
  if (prev !== undefined && now - prev < RATE_LIMIT_MS) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const adminId = env.ADMIN_TELEGRAM_ID;
  if (!isValidTelegramAdminChatId(adminId)) {
    return NextResponse.json(
      { ok: false, error: "config", message: "Отправка временно недоступна" },
      { status: 503 },
    );
  }

  const messageText = fitTelegramMessage(
    buildGuestTelegramText({
      email,
      message,
      userAgent,
      surface,
      fromPath,
    }),
  );

  // S7 (unified-messaging): emit telegram intent via relay-outbound → integrator dispatchPort.
  // The pre-fork dev redirect (D7/G1) is the single chokepoint; interim dev-suppress guard retired here.
  // Public (no-session) uses the M2M relay secret (N1 approved — same secret, server-to-server).
  const messageId = `support:public:${Date.now()}`;
  const result = await relayOutbound({
    messageId,
    channel: "telegram",
    recipient: String(adminId),
    text: messageText,
  });

  if (!result.ok) {
    logger.error(
      { reason: result.reason, route: "public/support" },
      "[public/support] relay-outbound failed",
    );
    return NextResponse.json(
      { ok: false, error: "send_failed", message: "Не удалось отправить. Попробуйте позже." },
      { status: 502 },
    );
  }

  lastPublicSupportByKey.set(rateKey, Date.now());

  return NextResponse.json({ ok: true, message: "Сообщение отправлено" });
}
