import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';
import { getCurrentSession } from '@/modules/auth/service';
import { confirmEmailChallenge } from '@/modules/auth/emailAuth';
import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { notificationText } from '@/shared/notifications/notificationText';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { humanMergeDecisionSchema } from '@/modules/auth/humanMergeDecisionSchema';

const bodySchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().min(4).max(12),
  mergeDecision: humanMergeDecisionSchema.optional(),
});

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email/confirm:POST', request);

  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_confirm');
  if (rateLimit.limited) {
    if (rateLimit.reason === 'proxy_configuration') {
      return NextResponse.json({ ok: false, error: 'proxy_configuration' }, { status: 503 });
    }
    // Same shape this route already returns below for `result.code === "too_many_attempts"`.
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
        message: errMsg('rate_limited'),
      },
      { status: 429, headers: { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) } },
    );
  }

  if (!(await isAuthChannelEnabled('email', undefined, 'transactional'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized', message: notificationText.commonLoginRequired },
      { status: 401 },
    );
  }

  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'validation_error', message: notificationText.authInvalidBody },
      { status: 400 },
    );
  }

  const organizationId = getCurrentDbPrincipalOrganizationId();
  const result = await confirmEmailChallenge(
    session.user.userId,
    parsed.data.challengeId,
    parsed.data.code,
    'email_verify',
    {
      ...(organizationId ? { profileBindOrganizationId: organizationId } : {}),
      ...(parsed.data.mergeDecision ? { humanMergeDecision: parsed.data.mergeDecision } : {}),
    },
  );
  if (!result.ok) {
    if (result.code === 'merge_confirmation_required') {
      return NextResponse.json({ ok: true, mergeRequired: true, prompt: result.prompt });
    }
    const status =
      result.code === 'too_many_attempts' ? 429 : result.code === 'email_conflict' ? 409 : 400;
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        retryAfterSeconds: result.retryAfterSeconds,
        message: errMsg(result.code),
      },
      {
        status,
        ...(result.retryAfterSeconds != null && {
          headers: { 'Retry-After': String(result.retryAfterSeconds) },
        }),
      },
    );
  }

  if (result.mergedAccountId) {
    const deps = buildAppDeps();
    const user = await deps.userByPhone.findByUserId(session.user.userId);
    if (user) await deps.accountMergeNotifications.enqueue(user, result.mergedAccountId);
  }
  return NextResponse.json({ ok: true });
}

function errMsg(code: string): string {
  switch (code) {
    case 'invalid_code':
      return notificationText.authCodeInvalidOrExpired;
    case 'expired_code':
      return notificationText.authCodeExpiredRequestNew;
    case 'too_many_attempts':
      return notificationText.authTooManyAttempts;
    case 'rate_limited':
      return notificationText.authTooManyAttempts;
    case 'email_conflict':
      return notificationText.authEmailBelongsToAnotherAccount;
    default:
      return notificationText.authConfirmationFailed;
  }
}
