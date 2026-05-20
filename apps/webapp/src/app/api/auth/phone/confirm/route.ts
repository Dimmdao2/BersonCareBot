import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from "@/modules/auth/otpConstants";

const bodySchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(1),
  /** IANA с браузера (`Intl`), опционально — заполняет `calendar_timezone` при первом входе, если ещё пусто. */
  browserCalendarIana: z.string().max(120).optional(),
});

/**
 * Confirm phone code. Channel/chatId/displayName are never read from body;
 * binding uses only the context stored in the challenge at start.
 * Optional `browserCalendarIana` (IANA from `Intl`) fills `calendar_timezone` on first login if still empty.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "challenge_id_and_code_required", message: "Код подтверждения обязателен" },
      { status: 400 }
    );
  }
  const { challengeId, code, browserCalendarIana } = parsed.data;

  const deps = buildAppDeps();
  const result = await deps.auth.confirmPhoneAuth(challengeId, code);

  if (!result.ok) {
    const status =
      result.code === "too_many_attempts" || result.code === "rate_limited" ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(result.code, result.retryAfterSeconds),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        }),
      }
    );
  }

  await deps.auth.setSessionFromUser(result.user, {
    postLoginHints: { phoneOtpChannel: result.deliveryChannel ?? "sms" },
  });

  const tz = browserCalendarIana?.trim();
  if (tz) {
    await deps.patientCalendarTimezone.trySetInitialIfEmpty(result.user.userId, tz);
  }

  return NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
    role: result.user.role,
  });
}

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case "invalid_code":
      return "Неверный код";
    case "expired_code":
      return "Код истёк. Запросите новый.";
    case "too_many_attempts":
      return OTP_TOO_MANY_ATTEMPTS_MESSAGE;
    case "rate_limited":
      return retryAfterSeconds != null
        ? formatOtpRetryAfterMessage(retryAfterSeconds)
        : "Слишком много запросов. Попробуйте позже.";
    case "server_error":
      return "Не удалось завершить вход. Повторите ввод того же кода.";
    default:
      return "Ошибка подтверждения.";
  }
}
