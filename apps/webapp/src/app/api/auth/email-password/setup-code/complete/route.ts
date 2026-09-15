import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { completePasswordSetupAfterVerification } from '@/app-layer/auth/completePasswordSetup';
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

const bodySchema = z.object({
  email: z.string().email(),
  challengeId: z.string().uuid().optional(),
  code: z.string().min(4).max(32),
  password: z.string().min(8).max(128),
});

const DUMMY_SETUP_USER_ID = '00000000-0000-4000-8000-000000000000';

function setupCodeNeutralFailureResponse() {
  return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 });
}

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

  if (!(await isAuthChannelEnabled('email', undefined, 'transactional'))) {
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
  const candidateUserId = state.kind === 'needs_email_setup' ? state.userId : DUMMY_SETUP_USER_ID;

  const confirmed = parsed.data.challengeId
    ? await confirmEmailChallenge(
        candidateUserId,
        parsed.data.challengeId,
        parsed.data.code,
        'password_setup',
      )
    : await consumeLatestEmailChallengeCodeForUser(
        candidateUserId,
        parsed.data.code,
        'password_setup',
      );
  if (!confirmed.ok) {
    return setupCodeNeutralFailureResponse();
  }
  if (state.kind !== 'needs_email_setup') return setupCodeNeutralFailureResponse();

  const completed = await completePasswordSetupAfterVerification({
    deps,
    userId: state.userId,
    emailNormalized: emailNorm,
    password: parsed.data.password,
    principalSource: 'api/auth/email-password/setup-code/complete:email-verified-self',
  });
  if (!completed.ok) {
    return NextResponse.json({ ok: false, error: completed.error }, { status: completed.status });
  }
  return NextResponse.json(completed);
}
