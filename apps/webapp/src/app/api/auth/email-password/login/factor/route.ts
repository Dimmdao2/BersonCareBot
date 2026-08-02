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
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';

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
  const result = await deps.staffSecurity.completeLogin({
    token: continuation.token,
    code: parsed.data.code,
    recoveryCode: parsed.data.recoveryCode,
  });
  if (!result.ok) {
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
  await setSessionFromUser(user, {
    ...(continuation.postLoginHints ? { postLoginHints: continuation.postLoginHints } : {}),
    staffSecurity: {
      assurance,
      verifiedAt: Math.floor(Date.now() / 1000),
    },
  });
  await clearStaffLoginContinuation();
  return NextResponse.json({
    ok: true,
    redirectTo:
      assurance === 'factor_verified'
        ? getRedirectPathForRole(user.role)
        : '/app/account?tab=security',
    recoveryMode: result.recoveryMode,
    role: user.role,
  });
}
