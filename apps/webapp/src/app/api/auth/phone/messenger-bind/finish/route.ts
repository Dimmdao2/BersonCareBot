import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from "@/app-layer/product-analytics/recordAuthRegistration";
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

  const setupToken = parsed.data.setupToken.trim();
  const attemptId = setupToken;

  const deps = buildAppDeps();
  const resolved = await deps.phoneMessengerBind.resolveLoginChallenge(setupToken);

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

  const challenge = await deps.auth.getPhoneChallenge(resolved.challengeId);
  const isRegistrationIntent = challenge?.isRegistrationIntent === true;

  const result = await deps.auth.confirmPhoneAuth(resolved.challengeId, resolved.code);
  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId,
        authMethod: "messenger_bind",
        stage: "confirm",
        entryChannel: "browser",
        contactType: "phone",
        contactValue: challenge?.phone ?? null,
        challengeId: resolved.challengeId,
        errorCode: result.code,
      });
    }
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

  if (isRegistrationIntent) {
    await recordAuthRegistrationSuccess({
      attemptId,
      authMethod: "messenger_bind",
      stage: "session_set",
      entryChannel: "browser",
      contactType: "phone",
      contactValue: result.user.phone ?? challenge?.phone ?? null,
      userId: result.user.userId,
      challengeId: resolved.challengeId,
      isNewAccount: true,
    });
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
    default:
      return "Ошибка подтверждения.";
  }
}
