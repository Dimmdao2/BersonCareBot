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

const bodySchema = z.object({
  challengeId: z.string().trim().min(1),
  code: z.string().trim().min(1),
  browserCalendarIana: z.string().max(120).optional(),
  attemptId: z.string().uuid().optional(),
});

/**
 * Confirm phone code. Channel/chatId/displayName are never read from body;
 * binding uses only the context stored in the challenge at start.
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
  const challenge = await deps.auth.getPhoneChallenge(challengeId);
  const attemptId =
    parsed.data.attemptId?.trim() ||
    challenge?.registrationAttemptId?.trim() ||
    challengeId;
  const isRegistrationIntent = challenge?.isRegistrationIntent === true;
  const entryChannel =
    challenge?.channelContext?.channel === "telegram"
      ? ("telegram" as const)
      : challenge?.channelContext?.channel === "max"
        ? ("max" as const)
        : ("browser" as const);

  const result = await deps.auth.confirmPhoneAuth(challengeId, code);

  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId,
        authMethod: "phone_otp",
        stage: "confirm",
        entryChannel,
        contactType: "phone",
        contactValue: challenge?.phone ?? null,
        challengeId,
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

  if (isRegistrationIntent && result.wasCreated) {
    await recordAuthRegistrationSuccess({
      attemptId,
      authMethod: "phone_otp",
      stage: "session_set",
      entryChannel,
      contactType: "phone",
      contactValue: result.user.phone ?? challenge?.phone ?? null,
      userId: result.user.userId,
      challengeId,
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
