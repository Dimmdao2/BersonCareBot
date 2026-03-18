import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/**
 * Start phone auth. Channel/chatId are never taken from request body for binding.
 * Only server-approved context is stored (here: web + server-generated id).
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    phone?: string;
    displayName?: string;
  } | null;

  const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
  if (!phone) {
    return NextResponse.json(
      { ok: false, error: "phone_required", message: "Номер телефона обязателен" },
      { status: 400 }
    );
  }

  const context = {
    channel: "web" as const,
    chatId: randomUUID(),
    displayName: typeof body?.displayName === "string" ? body.displayName.trim() || undefined : undefined,
  };

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
