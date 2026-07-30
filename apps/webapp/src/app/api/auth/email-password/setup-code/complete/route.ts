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
import {
  confirmEmailChallenge,
  consumeLatestEmailChallengeCodeForUser,
  normalizeEmail,
} from '@/modules/auth/emailAuth';
import { reconcileDbRoleWithEnvRole, resolveRoleFromEnv } from '@/modules/auth/envRole';
import { getRedirectPathForRole } from '@/modules/auth/redirectPolicy';
import { setSessionFromUser } from '@/modules/auth/service';
import { hashPin } from '@/modules/auth/pinHash';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';
import { isPlatformUserUuid } from '@/shared/platform-user/isPlatformUserUuid';

const bodySchema = z.object({
  email: z.string().email(),
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  password: z.string().min(8).max(128),
});

/** Contact-only email setup by code: verify email, set password, create session. */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/setup-code/complete:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_password_setup_code_complete');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    // Same shape this route already returns below for `confirmed.code === "too_many_attempts"`.
    return NextResponse.json(
      { ok: false, error: 'rate_limited', retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const emailNorm = normalizeEmail(parsed.data.email);
  const deps = buildAppDeps();
  const state = await deps.emailPasswordLookup.resolveAuthState(emailNorm);
  if (state.kind !== 'needs_email_setup') {
    const status = state.kind === 'verified_with_password' ? 409 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: state.kind === 'verified_with_password' ? 'already_has_login' : 'not_eligible',
      },
      { status },
    );
  }

  const confirmed = parsed.data.challengeId
    ? await confirmEmailChallenge(
        state.userId,
        parsed.data.challengeId,
        parsed.data.code,
        'password_setup',
      )
    : await consumeLatestEmailChallengeCodeForUser(
        state.userId,
        parsed.data.code,
        'password_setup',
      );
  if (!confirmed.ok) {
    const status = confirmed.code === 'too_many_attempts' ? 429 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: confirmed.code,
        retryAfterSeconds: confirmed.retryAfterSeconds,
      },
      {
        status,
        ...(confirmed.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(confirmed.retryAfterSeconds) },
        }),
      },
    );
  }

  if (!isPlatformUserUuid(state.userId)) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
  enterStaffSecuritySelfPrincipal(
    state.userId,
    'api/auth/email-password/setup-code/complete:email-verified-self',
  );
  const passwordHash = await hashPin(parsed.data.password);
  await deps.userPasswordCredentials.upsertPasswordHash(state.userId, emailNorm, passwordHash);
  let sessionUser = await deps.userByPhone.findByUserId(state.userId);
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }

  // C-4 (2026-07-26): the messenger/phone allowlists never grant role anymore (envRole.ts);
  // reconciled so a resolver that only ever says "client" cannot demote an existing staff role.
  const envRole = resolveRoleFromEnv({
    phone: sessionUser.phone,
    telegramId: sessionUser.bindings.telegramId,
    maxId: sessionUser.bindings.maxId,
  });
  const reconciledRole = reconcileDbRoleWithEnvRole(sessionUser.role, envRole);
  if (sessionUser.role !== reconciledRole) {
    await deps.userProjection.updateRole(sessionUser.userId, reconciledRole);
    sessionUser = { ...sessionUser, role: reconciledRole };
  }

  await setSessionFromUser(sessionUser);
  return NextResponse.json({
    ok: true,
    redirectTo: getRedirectPathForRole(sessionUser.role),
    role: sessionUser.role,
  });
}
