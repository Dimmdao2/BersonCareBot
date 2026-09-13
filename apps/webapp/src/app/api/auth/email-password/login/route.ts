import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { jsonError } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
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
import { startEmailChallenge } from '@/modules/auth/emailAuth';
import { platformMailProfileForRecipientRole } from '@/modules/auth/mailProfile';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import { roleCanUsePortal } from '@/modules/auth/roleLogin';
import { notificationText } from '@/shared/notifications/notificationText';

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
  altcha: z.string().max(32_768).optional(),
  roleLoginPortal: z.enum(['doctor', 'patient', 'admin']).optional(),
});

// Same text as staffSecurityErrorText.ts's `portal_access_denied` case — a role/portal mismatch
// must read identically to a wrong password so a portal probe can't learn a role from the wording.
const INVALID_CREDENTIALS_MESSAGE = notificationText.authInvalidCredentialsOrPortalDenied;
const SERVER_ERROR_MESSAGE = notificationText.authEmailPasswordLoginFallback;

/**
 * Хост-поверхность — такое же несовпадение аудитории, как и `roleCanUsePortal` выше по маршруту:
 * когда хосты поверхностей различимы, `setSessionFromUser` отказывается выдать админскую сессию на
 * стаффовом хосте (и наоборот). Отказ приходил сюда голым `Error` и становился 500 «сбой на нашей
 * стороне» — владелец, набравший админские креды на test.therapysto.ru вместо
 * admin.test.therapysto.ru, видел поломку вместо отказа. Код тот же, что у портальной двери:
 * `portal_access_denied` намеренно читается браузеру как «неверные данные» (см.
 * shared/ui/auth/staffSecurityErrorText.ts), чтобы не выдавать роль тому, кто стучится вслепую.
 */
const SURFACE_MISMATCH_ERROR_RULES = {
  auth_surface_role_mismatch: { code: 'portal_access_denied', status: 403 },
} as const;

function settingIsEnabled(valueJson: unknown): boolean {
  return (
    valueJson !== null &&
    typeof valueJson === 'object' &&
    !Array.isArray(valueJson) &&
    (valueJson as Record<string, unknown>).value === true
  );
}

async function clinicRequiresStaffSecondFactor(
  deps: ReturnType<typeof buildAppDeps>,
  userId: string,
): Promise<boolean> {
  const organizationMembership = deps.organizationMembership;
  if (!organizationMembership) return false;
  const membership = await runWithDbBootstrapPrincipal(
    { source: 'api/auth/email-password/login:staff-workspace-resolve' },
    () =>
      organizationMembership.resolveOrganizationForUser({
        platformUserId: userId,
      }),
  );
  if (!membership.ok) return false;
  const setting = await deps.systemSettings.getSetting(
    'doctor_staff_second_factor_required',
    'doctor',
    { organizationId: membership.context.organizationId },
  );
  return settingIsEnabled(setting?.valueJson ?? null);
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
          // G4 (safety audit): was a divergent inline copy of `authProxyConfiguration` — the
          // route's own text used to win on this screen while the dictionary's won everywhere
          // else, for the SAME code. One wording now, read from the dictionary.
          message: notificationText.authProxyConfiguration,
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        // G4: was a divergent inline copy of `authRateLimited` (a THIRD variant,
        // `authTooManyRequestsRetryLater`, existed too, for a different rate limiter's fallback).
        message: notificationText.authRateLimited,
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
        // G4: exact duplicate of `authInvalidBody` typed inline instead of referenced.
        message: notificationText.authInvalidBody,
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
          // G4: exact duplicate of `authEmailNotVerifiedRetryLogin` typed inline.
          message: notificationText.authEmailNotVerifiedRetryLogin,
        },
        { status: 409 },
      );
    }

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

    if (!isPasswordEligibleRole(sessionUser.role)) {
      return NextResponse.json(
        { ok: false, error: PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR },
        { status: 403 },
      );
    }
    if (
      parsed.data.roleLoginPortal &&
      !roleCanUsePortal(sessionUser.role, parsed.data.roleLoginPortal)
    ) {
      return NextResponse.json({ ok: false, error: 'portal_access_denied' }, { status: 403 });
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
              // G4: exact duplicate of `authSecuritySetupPending` typed inline.
              message: notificationText.authSecuritySetupPending,
            },
            { status: 503 },
          );
        }
      }
    }
    const authenticatedUser = recoveringSpecialistSignup
      ? { ...sessionUser, role: 'doctor' as const }
      : sessionUser;
    const needsClinicEmailFactor =
      !security?.enrolled &&
      (await clinicRequiresStaffSecondFactor(deps, authenticatedUser.userId));
    let emailFactorChallenge:
      | { challengeId: string; token: string; expiresAt: string }
      | undefined;
    if (needsClinicEmailFactor) {
      const challenge = await startEmailChallenge(
        authenticatedUser.userId,
        emailNorm,
        'staff_login_factor',
        platformMailProfileForRecipientRole(authenticatedUser.role),
      );
      if (!challenge.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: 'email_factor_unavailable',
            // G4 (extended while already touching this file's other inline literals).
            message: notificationText.authEmailFactorSendFailed,
          },
          { status: 503 },
        );
      }
      emailFactorChallenge = {
        challengeId: challenge.challengeId,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
    }
    const prepared = await prepareVerifiedPrimaryLoginWithStatus({
      user: authenticatedUser,
      security,
      staffSecurity: deps.staffSecurity,
      emailFactorChallenge,
    });
    if (prepared.factorRequired) {
      return NextResponse.json({
        ok: true,
        factorRequired: true,
        factorMethod: prepared.factorMethod,
      });
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
    // Через общую дверь ответов, а не своим logger.error({ error }): ключ `error` сериализуется
    // закрытой формой (только type/code/class), поэтому текст и стек падения входа в журнал не
    // попадали вовсе — отказ входа был неразбираем. `resolveApiFailure` пишет полную деталь под
    // `operatorErrorDetail` и тем же correlation id, который получает вызывающий. Публичная форма
    // ответа не меняется: тот же `server_error` и тот же текст человеку.
    return jsonError({
      error,
      literalRules: SURFACE_MISMATCH_ERROR_RULES,
      fallback: {
        code: 'server_error',
        status: 500,
        publicFields: { message: SERVER_ERROR_MESSAGE },
      },
      logEvent: 'auth_email_password_login_unhandled_failure',
    });
  }
}
