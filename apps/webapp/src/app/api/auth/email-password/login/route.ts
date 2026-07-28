import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { prepareVerifiedPrimaryLoginWithStatus } from '@/modules/auth/verifiedStaffPrimaryLogin';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import {
  PASSWORD_LOCK_SECONDS,
  passwordFailurePrincipalId,
  waitForPasswordFailureDelay,
} from '@/modules/auth/passwordLoginProtection';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const INVALID_CREDENTIALS_MESSAGE =
  'Email или пароль неверны. Проверьте данные или восстановите пароль.';
const PASSWORD_LOCKED_MESSAGE =
  'Слишком много неудачных попыток. Подождите 15 минут или восстановите пароль.';

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/login:POST', request);
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_password_login');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json(
        {
          ok: false,
          error: 'proxy_configuration',
          message: 'Защита входа временно недоступна. Повторите попытку позже.',
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        message: 'Слишком много запросов. Подождите 10 минут и повторите попытку.',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) },
      },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();

  const pwd = await deps.userPasswordCredentials.verifyEmailPasswordForLogin(
    emailNorm,
    parsed.data.password,
  );
  if (!pwd.ok) {
    const failurePrincipalId = pwd.accountUserId ?? passwordFailurePrincipalId(emailNorm);
    enterStaffSecuritySelfPrincipal(
      failurePrincipalId,
      'api/auth/email-password/login:primary-failed',
    );
    if (pwd.passwordChecked) {
      await deps.userPasswordCredentials.recordFailedPasswordAttempt(failurePrincipalId);
    }
    await waitForPasswordFailureDelay(pwd.delaySeconds);
    if (pwd.locked) {
      const retryAfterSeconds = pwd.retryAfterSeconds ?? PASSWORD_LOCK_SECONDS;
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_credentials',
          message: PASSWORD_LOCKED_MESSAGE,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_credentials',
        message: INVALID_CREDENTIALS_MESSAGE,
      },
      { status: 401 },
    );
  }

  enterStaffSecuritySelfPrincipal(pwd.userId, 'api/auth/email-password/login:primary-verified');
  await deps.userPasswordCredentials.resetFailedPasswordAttempts(pwd.userId, emailNorm);
  if (!pwd.emailVerified) {
    return NextResponse.json(
      {
        ok: false,
        error: 'email_not_verified',
        message: 'Email не подтверждён. Подтвердите адрес и повторите вход.',
      },
      { status: 409 },
    );
  }

  let sessionUser = await deps.userByPhone.findByUserId(pwd.userId);
  if (!sessionUser) {
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_credentials',
        message: INVALID_CREDENTIALS_MESSAGE,
      },
      { status: 401 },
    );
  }

  const envRole = resolveRoleFromEnv({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });
  const effectiveRole = reconcileDbRoleWithEnvRole(sessionUser.role, envRole);
  if (sessionUser.role !== effectiveRole) {
    await deps.userProjection.updateRole(sessionUser.userId, effectiveRole);
    sessionUser = { ...sessionUser, role: effectiveRole };
  }

  let security = await deps.staffSecurity.getStatus();
  let recoveringSpecialistSignup = false;
  if (!security) {
    const signupIntent =
      await deps.organizationProvisioning.getLatestSpecialistSignupIntentForUser();
    if (signupIntent) {
      recoveringSpecialistSignup = true;
      try {
        security = await deps.staffSecurity.ensureProfile();
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: 'security_setup_pending',
            message: 'Не удалось подготовить защищённый вход. Повторите попытку позже.',
          },
          { status: 503 },
        );
      }
    }
  }
  const authenticatedUser = recoveringSpecialistSignup
    ? { ...sessionUser, role: 'doctor' as const }
    : sessionUser;
  const prepared = await prepareVerifiedPrimaryLoginWithStatus({
    user: authenticatedUser,
    security,
    staffSecurity: deps.staffSecurity,
  });
  if (prepared.factorRequired) {
    return NextResponse.json({ ok: true, factorRequired: true });
  }

  await setSessionFromUser(authenticatedUser, prepared.sessionOptions);
  return NextResponse.json({
    ok: true,
    redirectTo:
      security && !security.enrolled
        ? '/app/account?tab=security'
        : getRedirectPathForRole(sessionUser.role),
  });
}
