import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

/**
 * Confirm phone code. Channel/chatId/displayName are never read from body;
 * binding uses only the context stored in the challenge at start.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    challengeId?: string;
    code?: string;
  } | null;

  const challengeId = typeof body?.challengeId === "string" ? body.challengeId.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!challengeId || !code) {
    return NextResponse.json(
      { ok: false, error: "challenge_id_and_code_required", message: "Код подтверждения обязателен" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const result = await deps.auth.confirmPhoneAuth(challengeId, code);

  if (!result.ok) {
    const status = result.code === "too_many_attempts" ? 429 : 400;
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

  await deps.auth.setSessionFromUser(result.user);

  return NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
    role: result.user.role,
  });
}

function errorMessage(code: string): string {
  switch (code) {
    case "invalid_code":
      return "Неверный код";
    case "expired_code":
      return "Код истёк. Запросите новый.";
    case "too_many_attempts":
      return "Превышено количество попыток.";
    default:
      return "Ошибка подтверждения.";
  }
}
