import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { normalizeEmail, startEmailChallenge } from "@/modules/auth/emailAuth";
import { OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";

const bodySchema = z.object({
  email: z.string().email(),
});

function forgotPasswordNeutralResponse(challengeRetryAfter?: number) {
  return NextResponse.json({
    ok: true,
    retryAfterSeconds: challengeRetryAfter ?? OTP_RESEND_COOLDOWN_SEC,
  });
}

/**
 * Запрос сброса пароля: код на почту (тот же контур `email_challenges`, что и верификация регистрации).
 * Ответ **одинаковый** при отсутствии учётки, ошибке отправки и rate limit — без `challengeId` и без перечисления email.
 * Подтверждение: {@link consumeLatestEmailChallengeCodeForUser} или `POST …/reset` с `challengeId`.
 *
 * Contact-only email (врач/Rubitime, `email_verified_at` NULL, нет `user_password_credentials`) получает
 * setup-код через тот же email challenge; явный UI lookup уже перевёл пользователя в setup-password flow.
 */
export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const userId = await deps.userPasswordCredentials.findVerifiedUserIdWithPassword(emailNorm);
  if (userId) {
    void startEmailChallenge(userId, emailNorm).catch(() => undefined);
    return forgotPasswordNeutralResponse(OTP_RESEND_COOLDOWN_SEC);
  }

  const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);
  if (state.kind === "needs_email_setup") {
    const challenge = await startEmailChallenge(state.userId, emailNorm);
    if (challenge.ok) {
      return NextResponse.json({
        ok: true,
        challengeId: challenge.challengeId,
        retryAfterSeconds: challenge.retryAfterSeconds ?? OTP_RESEND_COOLDOWN_SEC,
        setupRequired: true,
      });
    }
    return forgotPasswordNeutralResponse(challenge.retryAfterSeconds);
  }

  return forgotPasswordNeutralResponse();
}
