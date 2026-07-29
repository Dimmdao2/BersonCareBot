import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { requireStaffSecurityApiSession } from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import type { PasswordChangeResult } from '@/modules/auth/passwordChange';
import { newPasswordSchema } from '@/modules/auth/passwordPolicy';
import { setSessionFromUser } from '@/modules/auth/service';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
  altcha: z.string().max(32_768).optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/account/security/password/change:POST', request);

  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;

  // Authenticate before consuming the shared confirm budget so anonymous callers cannot exhaust it;
  // authenticated password guesses remain rate-limited below.
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'account_password_change');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) },
      },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const weakNewPassword = parsed.error.issues.some((issue) => issue.path[0] === 'newPassword');
    return NextResponse.json(
      {
        ok: false,
        error: weakNewPassword ? 'weak_new_password' : 'invalid_body',
      },
      { status: 400 },
    );
  }

  let result: PasswordChangeResult;
  try {
    const deps = buildAppDeps();
    const verifiedEmail = await deps.userByPhone.getVerifiedEmailForUser(gate.session.user.userId);
    const altchaProof = verifiedEmail
      ? await deps.passwordAltcha.verify(verifiedEmail.trim().toLowerCase(), parsed.data.altcha)
      : undefined;
    result = await deps.passwordChange.changePassword({
      userId: gate.session.user.userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      ...(altchaProof ? { altchaProof } : {}),
      altchaSubmitted: parsed.data.altcha !== undefined,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : undefined;
    logger.error(
      { err, errorMessage, errorCode },
      '[account/security/password/change] password change failed',
    );
    return NextResponse.json({ ok: false, error: 'password_change_failed' }, { status: 500 });
  }
  if (!result.ok) {
    const locked = result.error === 'password_temporarily_locked';
    const retryAfterSeconds = result.retryAfterSeconds ?? 15 * 60;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message: locked
          ? 'Слишком много неверных попыток. Подождите 15 минут или восстановите пароль.'
          : result.error === 'wrong_current_password'
            ? 'Текущий пароль неверен. Проверьте его или восстановите пароль.'
            : 'Вход по паролю не настроен. Используйте другой способ входа.',
        ...(locked ? { retryAfterSeconds } : {}),
        captchaRequired: result.captchaRequired === true,
        captchaRefreshRequired: result.captchaRefreshRequired === true,
      },
      {
        status: locked ? 429 : result.error === 'wrong_current_password' ? 401 : 409,
        ...(locked ? { headers: { 'Retry-After': String(retryAfterSeconds) } } : {}),
      },
    );
  }

  try {
    await setSessionFromUser(
      result.user,
      gate.session.staffSecurity ? { staffSecurity: gate.session.staffSecurity } : undefined,
    );
  } catch (err) {
    logger.error(
      { err },
      '[account/security/password/change] session reissue failed after password change',
    );
    return NextResponse.json(
      {
        ok: false,
        error: 'password_changed_session_reissue_failed',
        passwordChanged: true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
