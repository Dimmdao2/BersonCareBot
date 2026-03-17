import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ChannelKind } from "@/modules/auth/channelContext";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    phone?: string;
    channel?: ChannelKind;
    chatId?: string;
    displayName?: string;
  } | null;

  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "phone_required", message: "Номер телефона обязателен" },
      { status: 400 }
    );
  }

  const channel = body?.channel ?? "web";
  const chatId = (typeof body?.chatId === "string" ? body.chatId.trim() : null) || randomUUID();
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : undefined;

  const deps = buildAppDeps();
  const result = await deps.auth.startPhoneAuth(phone, { channel, chatId, displayName });

  if (!result.ok) {
    const status = result.code === "rate_limited" || result.code === "too_many_attempts" ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(result.code),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      }
    );
  }

  return NextResponse.json({
    ok: true,
    challengeId: result.challengeId,
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

function errorMessage(code: string): string {
  switch (code) {
    case "invalid_phone":
      return "Неверный формат номера";
    case "rate_limited":
      return "Слишком много запросов. Попробуйте позже.";
    case "too_many_attempts":
      return "Превышено количество попыток.";
    default:
      return "Ошибка отправки кода.";
  }
}
