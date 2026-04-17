/**
 * POST /api/patient/support — обращение в поддержку: письмо админу в Telegram.
 * Доступ: сессия пациента; разрешены tier `allow` и onboarding `need_activation`; только `stale_session` → 401.
 */

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { logger } from "@/app-layer/logging/logger";
import { env } from "@/config/env";
import { getCurrentSession } from "@/modules/auth/service";
import { getTelegramBotToken } from "@/modules/system-settings/integrationRuntime";
import { patientClientBusinessGate } from "@/modules/platform-access";
import { canAccessPatient } from "@/modules/roles/service";

const RATE_LIMIT_MS = 60_000;
const lastSupportByRateKey = new Map<string, number>();

const MAX_MESSAGE_LEN = 4000;
const TELEGRAM_MAX = 4096;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Telegram `chat_id`: не 0; отрицательные id допустимы (группы). */
function isValidTelegramAdminChatId(id: number | undefined): id is number {
  return typeof id === "number" && Number.isFinite(id) && id !== 0;
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

function buildTelegramText(params: {
  email: string;
  message: string;
  userId: string;
  displayName: string;
  phone: string;
  bindings: { telegramId?: string; maxId?: string; vkId?: string };
  userAgent: string;
  surface: string;
  fromPath: string | null;
}): string {
  const b = params.bindings;
  const lines = [
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
  return lines.join("\n");
}

function fitTelegramMessage(text: string): string {
  if (text.length <= TELEGRAM_MAX) return text;
  const marker = "\n…(обрезано)";
  const head = text.slice(0, TELEGRAM_MAX - marker.length);
  return `${head}${marker}`;
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

  const token = (await getTelegramBotToken()).trim();
  const adminId = env.ADMIN_TELEGRAM_ID;
  if (!token || !isValidTelegramAdminChatId(adminId)) {
    return NextResponse.json(
      { ok: false, error: "config", message: "Отправка временно недоступна" },
      { status: 503 },
    );
  }

  const messageText = fitTelegramMessage(
    buildTelegramText({
      email,
      message,
      userId: session.user.userId,
      displayName: session.user.displayName ?? "",
      phone: session.user.phone ?? "",
      bindings: session.user.bindings,
      userAgent,
      surface,
      fromPath,
    }),
  );

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: adminId,
      text: messageText,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, body: err }, "[patient/support] Telegram sendMessage failed");
    return NextResponse.json(
      { ok: false, error: "send_failed", message: "Не удалось отправить. Попробуйте позже." },
      { status: 502 },
    );
  }

  lastSupportByRateKey.set(rateKey, Date.now());

  return NextResponse.json({ ok: true, message: "Сообщение отправлено" });
}
