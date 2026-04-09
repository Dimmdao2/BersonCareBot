/**
 * POST /api/patient/question — отправить вопрос админу в Telegram.
 * Доступно только для пациентов, зашедших через браузер (без telegramId/maxId).
 * Требует привязанный телефон.
 */

import { NextResponse } from "next/server";
import { logger } from "@/infra/logging/logger";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessPatient } from "@/modules/roles/service";
import { env } from "@/config/env";
import { routePaths } from "@/app-layer/routes/paths";
import { getTelegramBotToken } from "@/modules/system-settings/integrationRuntime";

function isBrowserOnly(bindings: { telegramId?: string; maxId?: string }): boolean {
  return !bindings.telegramId?.trim() && !bindings.maxId?.trim();
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session || !canAccessPatient(session.user.role)) {
    return NextResponse.json({ ok: false, error: "unauthorized", message: "Требуется вход" }, { status: 401 });
  }

  if (!isBrowserOnly(session.user.bindings)) {
    return NextResponse.json(
      { ok: false, error: "messenger_only", message: "Вопросы из мессенджера отправляются в чате" },
      { status: 403 }
    );
  }

  const body = (await request.json().catch(() => null)) as { text?: string; from?: string } | null;

  if (!session.user.phone?.trim()) {
    const from = typeof body?.from === "string" ? body.from.trim() : "";
    const next = encodeURIComponent(from && from.startsWith("/app/patient") ? from : routePaths.patient);
    return NextResponse.json(
      {
        ok: false,
        error: "phone_required",
        message: "Для отправки вопроса нужна привязка телефона",
        redirectTo: `${routePaths.bindPhone}?next=${next}`,
      },
      { status: 403 }
    );
  }

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) {
    return NextResponse.json(
      { ok: false, error: "invalid_text", message: "Введите текст вопроса (до 4000 символов)" },
      { status: 400 }
    );
  }

  const token = (await getTelegramBotToken()).trim();
  const adminId = env.ADMIN_TELEGRAM_ID;
  if (!token || adminId == null) {
    return NextResponse.json(
      { ok: false, error: "config", message: "Отправка вопросов временно недоступна" },
      { status: 503 }
    );
  }

  const name = session.user.displayName || "Пользователь";
  const phone = session.user.phone || "";
  const messageText = `Новый вопрос (веб)\nОт: ${name}\nТелефон: ${phone}\nТекст:\n${text}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: adminId,
      text: messageText,
      parse_mode: undefined,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error(
      { status: res.status, body: err },
      "[patient/question] Telegram sendMessage failed",
    );
    return NextResponse.json(
      { ok: false, error: "send_failed", message: "Не удалось отправить. Попробуйте позже." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: "Вопрос отправлен" });
}
