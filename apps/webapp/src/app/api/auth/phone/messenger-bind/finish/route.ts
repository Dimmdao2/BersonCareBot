import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from "@/modules/auth/otpConstants";
import { getRedirectPathForRole } from "@/modules/auth/redirectPolicy";
import { getCurrentSession } from "@/modules/auth/service";

const bodySchema = z
  .object({
    setupToken: z.string().min(4),
    browserCalendarIana: z.string().max(120).optional(),
  })
  .strict();

/**
 * Завершает вход после привязки контакта в мессенджере (тот же браузер, что вызвал messenger-bind/start).
 * OTP подтверждается на сервере по challenge из bind secret — пользователю не нужно вводить код в PWA.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", message: "Укажите setupToken" },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const resolved = await deps.phoneMessengerBind.resolveLoginChallenge(parsed.data.setupToken);

  if (!resolved.ok) {
    if (resolved.code === "already_consumed") {
      const session = await getCurrentSession();
      if (session) {
        return NextResponse.json({
          ok: true,
          redirectTo: getRedirectPathForRole(session.user.role),
          role: session.user.role,
        });
      }
      return NextResponse.json({ ok: false, error: "already_consumed" }, { status: 409 });
    }

    const status =
      resolved.code === "not_found"
        ? 404
        : resolved.code === "not_ready" || resolved.code === "challenge_expired"
          ? 409
          : 400;
    return NextResponse.json({ ok: false, error: resolved.code }, { status });
  }

  const result = await deps.auth.confirmPhoneAuth(resolved.challengeId, resolved.code);
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
      },
    );
  }

  await deps.auth.setSessionFromUser(result.user, {
    postLoginHints: { phoneOtpChannel: result.deliveryChannel ?? "telegram" },
  });

  const tz = parsed.data.browserCalendarIana?.trim();
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
      return "Не удалось завершить вход. Попробуйте снова.";
    default:
      return "Ошибка подтверждения.";
  }
}
