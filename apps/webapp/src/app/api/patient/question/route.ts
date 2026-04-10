/**
 * POST /api/patient/question — отправить вопрос админу в Telegram.
 * Доступно только для пациентов, зашедших через браузер (без telegramId/maxId).
 * Требует tier **patient** (как остальные `/api/patient/*` через `requirePatientApiBusinessAccess`).
 */

import { NextResponse } from "next/server";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { logger } from "@/infra/logging/logger";
import { env } from "@/config/env";
import { routePaths } from "@/app-layer/routes/paths";
import { getTelegramBotToken } from "@/modules/system-settings/integrationRuntime";

function isBrowserOnly(bindings: { telegramId?: string; maxId?: string }): boolean {
  return !bindings.telegramId?.trim() && !bindings.maxId?.trim();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string; from?: string } | null;
  const from = typeof body?.from === "string" ? body.from.trim() : "";
  const returnPath = from && from.startsWith("/app/patient") ? from : routePaths.patient;

  const gate = await requirePatientApiBusinessAccess({ returnPath });
  if (!gate.ok) return gate.response;

  const { session } = gate;

  if (!isBrowserOnly(session.user.bindings)) {
    return NextResponse.json(
      { ok: false, error: "messenger_only", message: "Вопросы из мессенджера отправляются в чате" },
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
