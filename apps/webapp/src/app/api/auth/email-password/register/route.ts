import { randomUUID } from 'node:crypto';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import {
  newRegistrationAttemptId,
  recordAuthRegistrationAttempt,
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import { normalizeEmail, startEmailChallenge } from '@/modules/auth/emailAuth';
import { hashPin } from '@/modules/auth/pinHash';
import { OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';
import { platformMailProfileForRecipientRole } from '@/modules/auth/mailProfile';
import {
  isPasswordEligibleRole,
  PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR,
} from '@/modules/auth/passwordEligibility';
import {
  FIO_LATIN_REJECTED_MESSAGE,
  FIO_LATIN_REJECTED_TEXT,
  isCyrillicFioInput,
  isCyrillicFioInputOrEmpty,
  isFioLatinRejection,
  normalizeFioPart,
} from '@/shared/lib/fio';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  lastName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  firstName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine(isCyrillicFioInput, { message: FIO_LATIN_REJECTED_MESSAGE }),
  patronymic: z
    .string()
    .trim()
    .max(100)
    .refine(isCyrillicFioInputOrEmpty, { message: FIO_LATIN_REJECTED_MESSAGE })
    .optional(),
});

const LOG_BASE = {
  authMethod: 'email_password' as const,
  entryChannel: 'browser' as const,
  contactType: 'email' as const,
};

/**
 * Ответ «код отправлен» для случая, когда на этот адрес аккаунт уже есть.
 *
 * Решение владельца 13.09: «форма всегда отвечает "мы отправили код"». До этого форма отдавала
 * 409 `duplicate_email` / `email_conflict`, и по нему кто угодно проверял чужие адреса на наличие
 * аккаунта, просто подставляя их в регистрацию. Ответ теперь не отличается от успешного старта;
 * кода при этом не создаётся — challengeId случайный, подтверждать по нему нечего.
 *
 * Письма о попытке здесь нет намеренно: это дверь клиентских (`role: 'client'`) учёток, а клиенту,
 * по словам владельца, «такого не надо вообще — он всё равно всегда без пароля входит по коду».
 * Письмо о повторной регистрации отправляет дверь специалиста
 * (`api/auth/specialist-signup/start`), где человек действительно работает с паролем.
 */
function neutralCodeSentResponse(attemptId: string) {
  return NextResponse.json({
    ok: true,
    attemptId,
    challengeId: randomUUID(),
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SEC,
  });
}

/** Регистрация email+password: строка канона + пароль; подтверждение почты через существующий email challenge. */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/register:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  // This endpoint only ever creates `role: 'client'` accounts (registerPendingVerification below) —
  // patients have no password (owner, 2026-08-04). Specialists register with a password through the
  // separate specialist-signup flow (registerPendingSpecialistVerification).
  if (!isPasswordEligibleRole('client')) {
    return NextResponse.json(
      { ok: false, error: PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR },
      { status: 403 },
    );
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  const attemptId = newRegistrationAttemptId();

  if (!parsed.success) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      stage: 'start',
      contactValue: null,
      errorCode: 'invalid_body',
    });
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_body',
        ...(isFioLatinRejection(parsed) ? { message: FIO_LATIN_REJECTED_TEXT } : {}),
      },
      { status: 400 },
    );
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const lastName = normalizeFioPart(parsed.data.lastName);
  const firstName = normalizeFioPart(parsed.data.firstName);
  const patronymic = normalizeFioPart(parsed.data.patronymic);
  if (!lastName || !firstName) {
    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      stage: 'start',
      contactValue: emailNorm,
      errorCode: 'invalid_body',
    });
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  await recordAuthRegistrationAttempt({
    ...LOG_BASE,
    attemptId,
    stage: 'start',
    contactValue: emailNorm,
  });

  const deps = buildAppDeps();
  const passwordHash = await hashPin(parsed.data.password);

  const reg = await deps.userPasswordCredentials.registerPendingVerification({
    emailNormalized: emailNorm,
    passwordHash,
    lastName,
    firstName,
    patronymic,
  });

  async function respondWithChallenge(userId: string, rollbackOnSendFail: boolean) {
    const challenge = await startEmailChallenge(
      userId,
      emailNorm,
      'password_register',
      platformMailProfileForRecipientRole('client'),
    );
    if (!challenge.ok) {
      if (rollbackOnSendFail) {
        await deps.userPasswordCredentials.deleteUnverifiedEmailPasswordRegistration(userId);
      }
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: 'challenge_sent',
        contactValue: emailNorm,
        userId,
        errorCode: challenge.code,
      });
      return NextResponse.json(
        { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
        { status: challenge.code === 'rate_limited' ? 429 : 400 },
      );
    }
    await recordAuthRegistrationSuccess({
      ...LOG_BASE,
      attemptId,
      stage: 'challenge_sent',
      contactValue: emailNorm,
      userId,
      challengeId: challenge.challengeId,
      isNewAccount: true,
    });
    return NextResponse.json({
      ok: true,
      attemptId,
      challengeId: challenge.challengeId,
      retryAfterSeconds: challenge.retryAfterSeconds,
    });
  }

  if (reg.ok) {
    return respondWithChallenge(reg.userId, true);
  }

  if (reg.reason === 'duplicate_email') {
    const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);

    if (state.kind === 'needs_email_setup') {
      const challenge = await startEmailChallenge(
        state.userId,
        emailNorm,
        'password_register',
        platformMailProfileForRecipientRole('client'),
      );
      if (!challenge.ok) {
        await recordAuthRegistrationFailure({
          ...LOG_BASE,
          attemptId,
          stage: 'start',
          contactValue: emailNorm,
          userId: state.userId,
          errorCode: challenge.code,
        });
        return NextResponse.json(
          { ok: false, error: challenge.code, retryAfterSeconds: challenge.retryAfterSeconds },
          { status: challenge.code === 'rate_limited' ? 429 : 503 },
        );
      }
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: 'challenge_sent',
        contactValue: emailNorm,
        userId: state.userId,
        challengeId: challenge.challengeId,
        errorCode: 'existing_account_needs_email_setup',
      });
      // Код реально отправлен, поэтому ответ и остаётся успешным. Поля
      // `error: 'existing_account_needs_email_setup'` и `setupCodeSent` убраны: они сообщали
      // вызывающему, что аккаунт уже есть, то есть были тем же перечислением адресов, что и 409
      // ниже. Подтверждение кода идёт по challengeId и в этой подсказке не нуждается.
      return NextResponse.json({
        ok: true,
        attemptId,
        challengeId: challenge.challengeId,
        retryAfterSeconds: challenge.retryAfterSeconds,
      });
    }

    if (state.kind === 'email_conflict') {
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: 'start',
        contactValue: emailNorm,
        errorCode: 'email_conflict',
      });
      return neutralCodeSentResponse(attemptId);
    }

    if (state.kind === 'verified_with_password') {
      await recordAuthRegistrationFailure({
        ...LOG_BASE,
        attemptId,
        stage: 'start',
        contactValue: emailNorm,
        errorCode: 'duplicate_email',
      });
      return neutralCodeSentResponse(attemptId);
    }

    if (state.kind === 'pending_registration') {
      const resent = await deps.userPasswordCredentials.tryResendRegistrationChallenge({
        emailNormalized: emailNorm,
        plainPassword: parsed.data.password,
      });
      if (!resent.ok) {
        await recordAuthRegistrationFailure({
          ...LOG_BASE,
          attemptId,
          stage: 'start',
          contactValue: emailNorm,
          errorCode: 'duplicate_email',
        });
        return neutralCodeSentResponse(attemptId);
      }
      return respondWithChallenge(resent.userId, false);
    }

    await recordAuthRegistrationFailure({
      ...LOG_BASE,
      attemptId,
      stage: 'start',
      contactValue: emailNorm,
      errorCode: 'duplicate_email',
    });
    return neutralCodeSentResponse(attemptId);
  }

  await recordAuthRegistrationFailure({
    ...LOG_BASE,
    attemptId,
    stage: 'start',
    contactValue: emailNorm,
    errorCode: 'duplicate_email',
  });
  return neutralCodeSentResponse(attemptId);
}
