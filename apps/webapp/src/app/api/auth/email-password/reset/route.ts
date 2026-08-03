import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { checkAuthConfirmRateLimit } from '@/modules/auth/authConfirmRateLimit';
import {
  consumeEmailChallengeCode,
  consumeLatestEmailChallengeCodeForUser,
  normalizeEmail,
} from '@/modules/auth/emailAuth';
import { hashPin } from '@/modules/auth/pinHash';
import { newPasswordSchema } from '@/modules/auth/passwordPolicy';
import {
  isPasswordEligibleRole,
  PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR,
} from '@/modules/auth/passwordEligibility';
import { enterStaffSecuritySelfPrincipal } from '@/app-layer/principal/staffSecuritySelfPrincipal';

const bodySchema = z.object({
  email: z.string().email(),
  /** Опционально: после forgot-password без `challengeId` в ответе используется {@link consumeLatestEmailChallengeCodeForUser}. */
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  newPassword: newPasswordSchema,
});

const DUMMY_RESET_USER_ID = '00000000-0000-4000-8000-000000000000';

function resetNeutralFailureResponse() {
  return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 });
}

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/reset:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_password_reset');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    // This route already gives ZERO distinguishing signal for ANY failure -- even a nonexistent
    // account -- to avoid an account-existence oracle. A rate-limited response keeps that same
    // uniform shape (ASVS 6.3.8) rather than introducing a new, more informative 429/"rate_limited".
    return resetNeutralFailureResponse();
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
  const userId = await deps.userPasswordCredentials.findVerifiedUserIdWithPassword(emailNorm);
  if (!userId) {
    if (parsed.data.challengeId) {
      await consumeEmailChallengeCode(
        DUMMY_RESET_USER_ID,
        parsed.data.challengeId,
        parsed.data.code,
        'password_reset',
      );
    } else {
      await consumeLatestEmailChallengeCodeForUser(
        DUMMY_RESET_USER_ID,
        parsed.data.code,
        'password_reset',
      );
    }
    return resetNeutralFailureResponse();
  }

  const consumed = parsed.data.challengeId
    ? await consumeEmailChallengeCode(
        userId,
        parsed.data.challengeId,
        parsed.data.code,
        'password_reset',
      )
    : await consumeLatestEmailChallengeCodeForUser(userId, parsed.data.code, 'password_reset');
  if (!consumed.ok) {
    return resetNeutralFailureResponse();
  }

  const targetUser = await deps.userByPhone.findByUserId(userId);
  if (!targetUser || !isPasswordEligibleRole(targetUser.role)) {
    return NextResponse.json(
      { ok: false, error: PASSWORD_NOT_ALLOWED_FOR_ROLE_ERROR },
      { status: 403 },
    );
  }

  const passwordHash = await hashPin(parsed.data.newPassword);
  try {
    enterStaffSecuritySelfPrincipal(
      userId,
      'api/auth/email-password/reset:challenge-verified-self',
    );
    const security = await deps.staffSecurity.getStatus();
    // Revoke first: if the credential write fails, existing staff sessions still
    // fail closed and the user can request a fresh reset challenge.
    if (security) await deps.staffSecurity.revokeSessions();
    // C-1 (2026-07-26): the TOTP-gated revoke above only ever fires for an enrolled staff profile,
    // and on TEST that was ZERO of the 281 current users — so "reset the password to kick the
    // attacker out" silently revoked nothing. This call has no such precondition: it increments
    // `platform_users.session_epoch` unconditionally, for staff and patients alike.
    await deps.userByPhone.invalidateSessionsForSelf();
    await deps.userPasswordCredentials.updatePasswordHash(userId, emailNorm, passwordHash);
  } catch {
    return NextResponse.json({ ok: false, error: 'reset_failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
