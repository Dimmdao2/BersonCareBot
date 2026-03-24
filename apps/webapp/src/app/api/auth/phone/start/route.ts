import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import type { ChannelContext } from "@/modules/auth/channelContext";

const bodySchema = z.object({
  phone: z.string().min(1),
  displayName: z.string().optional(),
  channel: z.enum(["web", "telegram"]).optional(),
  chatId: z.string().optional(),
});

/**
 * Start phone auth. Для telegram channel/chatId берутся из тела (как на bind-phone);
 * для web при отсутствии chatId подставляется серверный UUID.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "phone_required", message: "Номер телефона обязателен" },
      { status: 400 }
    );
  }

  const { phone, displayName } = parsed.data;
  const channel = parsed.data.channel ?? "web";
  let context: ChannelContext;

  if (channel === "telegram") {
    const chatId = parsed.data.chatId?.trim();
    if (!chatId) {
      return NextResponse.json(
        { ok: false, error: "chat_id_required", message: "Для Telegram укажите chatId" },
        { status: 400 }
      );
    }
    context = {
      channel: "telegram",
      chatId,
      displayName: displayName?.trim() || undefined,
    };
  } else {
    const cid = parsed.data.chatId?.trim();
    context = {
      channel: "web",
      chatId: cid && cid.length > 0 ? cid : randomUUID(),
      displayName: displayName?.trim() || undefined,
    };
  }

  const deps = buildAppDeps();
  const result = await deps.auth.startPhoneAuth(phone, context);

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
