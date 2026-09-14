import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  clearStaffLoginContinuation,
  readStaffLoginContinuation,
} from '@/modules/auth/staffLoginContinuation';
import { setSessionFromUser } from '@/modules/auth/service';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { consumeEmailChallengeCode } from '@/modules/auth/emailAuth';
import { resolveLoginAttemptOrigin } from '@/modules/auth/loginAttemptOrigin';
import { recordLoginFailure } from '@/infra/loginFailureTally';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import { routePaths } from '@/app-layer/routes/paths';

/**
 * #1112 Л-8. Ненулевой счёт второго фактора значит, что пароль УЖЕ подошёл: до этого маршрута иначе
 * не доходят. Именно эту связь владелец просил сделать видимой при разборе — «будет видно что
 * блокировка произошла после успешного ввода пароля и сколько раз второй фактор ввели».
 */
async function recordSecondFactorFailure(request: Request, userId: string): Promise<void> {
  const origin = await resolveLoginAttemptOrigin(request);
  await recordLoginFailure({
    userId,
    deviceKey: origin.deviceKey,
    sourceIp: origin.sourceIp,
    kind: 'second_factor',
  });
}

const bodySchema = z
  .object({
    code: z
      .string()
      .regex(/^\d{6}$/u)
      .optional(),
    recoveryCode: z.string().trim().min(8).max(64).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode));

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/login/factor:POST', request);

  // C-2 remainder: this route verifies a TOTP/recovery code with no route-level rate limit at
  // all -- per-account lockout exists inside staffSecurity.completeLogin (factor_locked), but
  // nothing capped the per-IP attempt rate, so the code space could be attacked from many
  // addresses. Same chokepoint the other protected auth routes use, same position (before body
  // parsing), same shape mapping.
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_password_login_factor');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const continuation = await readStaffLoginContinuation();
  if (!continuation) {
    return NextResponse.json({ ok: false, error: 'login_challenge_expired' }, { status: 401 });
  }
  enterStaffSecuritySelfPrincipal(
    continuation.userId,
    'api/auth/email-password/login/factor:primary-verified',
  );
  const deps = buildAppDeps();
  if (continuation.factorMethod === 'email') {
    if (!continuation.emailChallengeId || !parsed.data.code || parsed.data.recoveryCode) {
      return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
    }
    const emailFactor = await consumeEmailChallengeCode(
      continuation.userId,
      continuation.emailChallengeId,
      parsed.data.code,
      'staff_login_factor',
    );
    if (!emailFactor.ok) {
      // #1112 Л-8. Считаем ТОЛЬКО не подошедший код. `expired_code` — код был наш, но просрочен, а
      // `too_many_attempts` — попытку вообще не проверяли. Записать их значило бы завысить число,
      // по которому потом разбирают, подбирали ли учётную запись.
      if (emailFactor.code === 'invalid_code') {
        await recordSecondFactorFailure(request, continuation.userId);
      }
      if (emailFactor.code === 'expired_code') await clearStaffLoginContinuation();
      return NextResponse.json(
        { ok: false, error: emailFactor.code, retryAfterSeconds: emailFactor.retryAfterSeconds },
        { status: emailFactor.code === 'too_many_attempts' ? 429 : 401 },
      );
    }
    const user = await deps.userByPhone.findByUserId(continuation.userId);
    if (!user)
      return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
    await setSessionFromUser(user, 'second_factor_email_code', {
      ...(continuation.postLoginHints ? { postLoginHints: continuation.postLoginHints } : {}),
      staffSecurity: { assurance: 'factor_verified', verifiedAt: Math.floor(Date.now() / 1000) },
    });
    await clearStaffLoginContinuation();
    return NextResponse.json({
      ok: true,
      redirectTo: user.mustChangePassword
        ? routePaths.passwordChangeRequired
        : getRedirectPathForRole(user.role),
      recoveryMode: false,
      role: user.role,
    });
  }
  const result = await deps.staffSecurity.completeLogin({
    token: continuation.token,
    code: parsed.data.code,
    recoveryCode: parsed.data.recoveryCode,
  });
  if (!result.ok) {
    // Признак ставит сама проверка кода: по `factor_locked` отсюда не понять, отвергли код или
    // отказали уже запертой учётной записи, не проверяя ничего.
    if ('codeRejected' in result && result.codeRejected) {
      await recordSecondFactorFailure(request, continuation.userId);
    }
    if (result.error === 'login_challenge_expired') await clearStaffLoginContinuation();
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        lockedUntil: 'lockedUntil' in result ? result.lockedUntil : undefined,
      },
      { status: result.error === 'factor_locked' ? 429 : 401 },
    );
  }
  const user = await deps.userByPhone.findByUserId(continuation.userId);
  if (!user) return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  const assurance = result.recoveryMode
    ? ('recovery' as const)
    : result.recoveryConfirmed
      ? ('factor_verified' as const)
      : ('recovery_confirmation' as const);
  await setSessionFromUser(
    user,
    result.recoveryMode ? 'second_factor_recovery_code' : 'second_factor_totp',
    {
      ...(continuation.postLoginHints ? { postLoginHints: continuation.postLoginHints } : {}),
      staffSecurity: {
        assurance,
        verifiedAt: Math.floor(Date.now() / 1000),
      },
    },
  );
  await clearStaffLoginContinuation();
  return NextResponse.json({
    ok: true,
    redirectTo:
      user.mustChangePassword
        ? routePaths.passwordChangeRequired
        : assurance === 'factor_verified'
        ? getRedirectPathForRole(user.role)
        : '/app/account?tab=security',
    recoveryMode: result.recoveryMode,
    role: user.role,
  });
}
