import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import { confirmPublicEmailOtpChallenge } from '@/modules/auth/emailOtpPublic';
import { setSessionFromUser } from '@/modules/auth/service';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { isVerifiedEmailGlobalAdminAsync } from '@/modules/auth/envRole';
import {
  formatOtpRetryAfterMessage,
  OTP_TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/modules/auth/otpConstants';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

const bodySchema = z.object({
  email: z.string().min(1),
  code: z.string().trim().min(1),
  browserCalendarIana: z.string().max(120).optional(),
});

/**
 * POST /api/auth/email-otp/confirm
 *
 * Public (unauthenticated) endpoint: verify OTP code and establish a session.
 * On success: sets session cookie, returns redirectTo + role (mirrors phone/confirm shape).
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-otp/confirm:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_otp_confirm');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
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

  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'email_and_code_required', message: 'Email и код обязательны' },
      { status: 400 },
    );
  }

  const { email, code } = parsed.data;
  const deps = buildAppDeps();
  const result = await confirmPublicEmailOtpChallenge(email, code, deps.emailOtpPublicDb);

  if (!result.ok) {
    const status = result.code === 'too_many_attempts' ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errorMessage(result.code, result.retryAfterSeconds),
      },
      {
        status,
        ...(result.retryAfterSeconds != null
          ? { headers: { 'Retry-After': String(result.retryAfterSeconds) } }
          : {}),
      },
    );
  }

  // Load full session user — we have userId but need role/bindings/displayName.
  if (isPlatformUserUuid(result.userId)) {
    enterStaffSecuritySelfPrincipal(result.userId, 'api/auth/email-otp/confirm:otp-verified-self');
  }
  const user = await deps.userByPhone.findByUserId(result.userId);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'user_not_found', message: 'Ошибка входа. Попробуйте снова.' },
      { status: 500 },
    );
  }

  // The code proves control of `email`; policy decides whether that verified identity is a global admin.
  // Email-derived staff access intentionally stays session-derived: every later session refresh rechecks the
  // DB-backed allowlist, so removing the address revokes access without a stale role row.
  // On policy removal/outage, use the freshly loaded DB role rather than retaining
  // an earlier email-derived session role. The B1c migration removes the only
  // historical persisted owner-email artifact.
  const role = (await isVerifiedEmailGlobalAdminAsync(email)) ? 'admin' : user.role;
  const sessionUser = role === user.role ? user : { ...user, role };

  await setSessionFromUser(sessionUser);

  const tz = parsed.data.browserCalendarIana?.trim();
  if (tz) {
    await deps.patientCalendarTimezone.syncFromDevice(sessionUser.userId, tz);
  }

  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
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
    case 'email_conflict':
      return 'Конфликт email. Обратитесь в поддержку.';
    default:
      return 'Ошибка подтверждения.';
  }
}
