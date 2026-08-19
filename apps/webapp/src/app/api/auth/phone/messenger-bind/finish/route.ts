import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess,
} from '@/app-layer/product-analytics/recordAuthRegistration';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/modules/auth/otpConstants';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { getCurrentSession } from '@/modules/auth/service';
import { readStaffLoginContinuation } from '@/modules/auth/staffLoginContinuation';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';
import { prepareVerifiedPrimaryLogin } from '@/modules/auth/verifiedStaffPrimaryLogin';
import { isAuthChannelEnabled } from '@/modules/auth/authChannelPolicy';

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
  stampBootstrapPrincipal('api/auth/phone/messenger-bind/finish:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'phone_messenger_bind_finish');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    // Same shape this route already returns below for `result.code === "rate_limited"`.
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
        message: errorMessage('rate_limited', AUTH_CONFIRM_RATE_LIMIT_SEC),
      },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', message: 'Укажите setupToken' },
      { status: 400 },
    );
  }

  const setupToken = parsed.data.setupToken.trim();
  const attemptId = setupToken;

  const deps = buildAppDeps();
  const resolved = await deps.phoneMessengerBind.resolveLoginChallenge(setupToken);

  if (!resolved.ok) {
    if (resolved.code === 'already_consumed') {
      const session = await getCurrentSession();
      if (session) {
        return NextResponse.json({
          ok: true,
          redirectTo: getRedirectPathForRole(session.user.role),
          role: session.user.role,
        });
      }
      if (await readStaffLoginContinuation()) {
        return NextResponse.json({ ok: true, factorRequired: true });
      }
      return NextResponse.json({ ok: false, error: 'already_consumed' }, { status: 409 });
    }

    const status =
      resolved.code === 'not_found'
        ? 404
        : resolved.code === 'not_ready' || resolved.code === 'challenge_expired'
          ? 409
          : 400;
    return NextResponse.json({ ok: false, error: resolved.code }, { status });
  }

  const challenge = await deps.auth.getPhoneChallenge(resolved.challengeId);
  const deliveryChannel = challenge?.deliveryChannel ?? 'telegram';
  if (!(await isAuthChannelEnabled(deliveryChannel))) {
    return NextResponse.json({ ok: false, error: 'auth_channel_disabled' }, { status: 403 });
  }
  const isRegistrationIntent = challenge?.isRegistrationIntent === true;

  const result = await deps.auth.confirmPhoneAuth(resolved.challengeId, resolved.code);
  if (!result.ok) {
    if (isRegistrationIntent) {
      await recordAuthRegistrationFailure({
        attemptId,
        authMethod: 'messenger_bind',
        stage: 'confirm',
        entryChannel: 'browser',
        contactType: 'phone',
        contactValue: challenge?.phone ?? null,
        challengeId: resolved.challengeId,
        errorCode: result.code,
      });
    }
    const status =
      result.code === 'too_many_attempts' || result.code === 'rate_limited' ? 429 : 400;
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
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  if (isPlatformUserUuid(result.user.userId)) {
    enterStaffSecuritySelfPrincipal(
      result.user.userId,
      'api/auth/phone/messenger-bind/finish:otp-verified-self',
    );
  }
  const sessionUser = await deps.userByPhone.findByUserId(result.user.userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
  const postLoginHints = { phoneOtpChannel: result.deliveryChannel ?? deliveryChannel } as const;

  const tz = parsed.data.browserCalendarIana?.trim();
  if (tz) {
    await deps.patientCalendarTimezone.syncFromDevice(sessionUser.userId, tz);
  }

  if (isRegistrationIntent) {
    await recordAuthRegistrationSuccess({
      attemptId,
      authMethod: 'messenger_bind',
      stage: 'session_set',
      entryChannel: 'browser',
      contactType: 'phone',
      contactValue: sessionUser.phone ?? challenge?.phone ?? null,
      userId: sessionUser.userId,
      challengeId: resolved.challengeId,
      isNewAccount: true,
    });
  }

  const prepared = await prepareVerifiedPrimaryLogin({
    user: sessionUser,
    staffSecurity: deps.staffSecurity,
    postLoginHints,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await deps.auth.setSessionFromUser(sessionUser, prepared.sessionOptions);

  return NextResponse.json({
    ok: true,
    redirectTo: result.redirectTo,
    role: sessionUser.role,
  });
}

function errorMessage(code: string, retryAfterSeconds?: number): string {
  switch (code) {
    case 'invalid_code':
      return 'Неверный код';
    case 'expired_code':
      return 'Код истёк. Запросите новый.';
    case 'too_many_attempts':
      return OTP_TOO_MANY_ATTEMPTS_MESSAGE;
    case 'rate_limited':
      return retryAfterSeconds != null
        ? formatOtpRetryAfterMessage(retryAfterSeconds)
        : 'Слишком много запросов. Попробуйте позже.';
    default:
      return 'Ошибка подтверждения.';
  }
}
