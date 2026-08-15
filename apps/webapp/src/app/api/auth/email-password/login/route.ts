import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { logger } from '@/app-layer/logging/logger';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import {
  isPasswordEligibleRole,
  PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR,
} from '@/modules/auth/passwordEligibility';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { prepareVerifiedPrimaryLoginWithStatus } from '@/modules/auth/verifiedStaffPrimaryLogin';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import { getServerConfigStructuredValue } from '@/modules/system-settings/configAdapter';
import {
  normalizeTestAccountIdentifiersValue,
  sessionMatchesTestAccountIdentifiers,
} from '@/modules/system-settings/testAccounts';
import type { SessionUser } from '@/shared/types/session';

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
  altcha: z.string().max(32_768).optional(),
});

const INVALID_CREDENTIALS_MESSAGE =
  'Email или пароль неверны. Проверьте данные или восстановите пароль.';
const SERVER_ERROR_MESSAGE =
  'Не удалось войти из-за сбоя на нашей стороне. Повторите попытку позже.';

function isConfiguredTestPatientPasswordLogin(
  user: SessionUser | null,
  emailNormalized: string,
  identifiersValue: unknown,
): boolean {
  if (!user || user.role !== 'client') return false;
  const identifiers = normalizeTestAccountIdentifiersValue(identifiersValue);
  if (!identifiers) return false;
  return (
    identifiers.emails.includes(emailNormalized) ||
    sessionMatchesTestAccountIdentifiers(
      {
        phone: user.phone,
        telegramId: user.bindings.telegramId,
        maxId: user.bindings.maxId,
      },
      identifiers,
    )
  );
}

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
    return NextResponse.json(
      {
        ok: false,
        error: 'invalid_body',
        message: 'Данные введены неверно. Проверьте их и повторите действие.',
      },
      { status: 400 },
    );
  }

  try {
    const emailNorm = normalizeEmail(parsed.data.email);
    const deps = buildAppDeps();
    const altchaProof = await deps.passwordAltcha.verify(emailNorm, parsed.data.altcha);

    const pwd = await deps.userPasswordCredentials.verifyEmailPasswordForLogin(
      emailNorm,
      parsed.data.password,
      altchaProof,
      parsed.data.altcha !== undefined,
    );
    if (!pwd.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_credentials',
          message: INVALID_CREDENTIALS_MESSAGE,
          retryAfterSeconds: pwd.retryAfterSeconds,
          captchaRequired: pwd.captchaRequired,
          captchaRefreshRequired: pwd.captchaRefreshRequired,
        },
        {
          status: 401,
          ...(pwd.retryAfterSeconds > 0
            ? { headers: { 'Retry-After': String(pwd.retryAfterSeconds) } }
            : {}),
        },
      );
    }

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

    // Read the fixed TEST allowlist while this pre-session request still carries the bootstrap
    // principal. The identity-self principal installed below is deliberately unable to read global
    // settings; moving this read below that boundary makes every configured patient look unlisted.
    const testAccountIdentifiers = await getServerConfigStructuredValue(
      'test_account_identifiers',
    ).catch(() => null);

    enterStaffSecuritySelfPrincipal(pwd.userId, 'api/auth/email-password/login:primary-verified');

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

    const testPatientPasswordLogin = isConfiguredTestPatientPasswordLogin(
      sessionUser,
      emailNorm,
      testAccountIdentifiers,
    );
    if (!isPasswordEligibleRole(sessionUser.role) && !testPatientPasswordLogin) {
      return NextResponse.json(
        { ok: false, error: PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR },
        { status: 403 },
      );
    }

    // Owner-approved TEST walkthrough exception (15.08.2026): the configured Dmitry Berson patient
    // account must be reachable with the same protected packet password as the doctor/admin accounts.
    // It remains a patient session and never enters the staff-factor pipeline. Production patients
    // and unlisted TEST patients retain the passwordless policy.
    if (sessionUser.role === 'client') {
      await setSessionFromUser(sessionUser);
      return NextResponse.json({
        ok: true,
        redirectTo: getRedirectPathForRole(sessionUser.role),
        role: sessionUser.role,
      });
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
      // A factor that the user has already enrolled is verified above. Without an enrolled factor,
      // 2FA is voluntary and the role's own cabinet remains reachable.
      redirectTo: getRedirectPathForRole(sessionUser.role),
      role: authenticatedUser.role,
    });
  } catch (error) {
    logger.error({ error }, '[auth/email-password/login] unhandled failure');
    return NextResponse.json(
      { ok: false, error: 'server_error', message: SERVER_ERROR_MESSAGE },
      { status: 500 },
    );
  }
}
