import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { logger } from '@/app-layer/logging/logger';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isEmailOtpStartRateLimitedByKey } from '@/modules/auth/authRateLimits';
import {
  AUTH_CHANNEL_DISABLED_ERROR,
  isAuthChannelEnabled,
} from '@/modules/auth/authChannelPolicy';
import { startPublicEmailOtpChallenge } from '@/modules/auth/emailOtpPublic';
import { formatOtpRetryAfterMessage } from '@/modules/auth/otpConstants';
import { resolveRealIpRateLimitClientKey } from '@/modules/auth/realIpRateLimitClientKey';

const bodySchema = z.object({
  email: z.string().min(1),
});

/** Общий bucket только в non-production, если прокси не передал X-Real-Ip. */
const EMAIL_OTP_START_FALLBACK_CLIENT_KEY = 'email_otp_start:missing_x_real_ip';
const PUBLIC_EMAIL_OTP_START_MIN_RESPONSE_MS = 500;

/**
 * POST /api/auth/email-otp/start
 *
 * Public (unauthenticated) endpoint: request a 6-digit OTP code to the given email.
 * Anti-enumeration: valid, non-rate-limited requests get the same response status/body schema and
 * minimum response-time class for known/unknown addresses and provider success/failure.
 * Distinguishing errors remain invalid_email and rate_limited.
 */
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-otp/start:POST', request);
  if (!(await isAuthChannelEnabled('email'))) {
    return NextResponse.json({ ok: false, error: AUTH_CHANNEL_DISABLED_ERROR }, { status: 503 });
  }
  ensureAuthModulePortsBound();

  // Per-IP limit (trusted X-Real-Ip only) — generic response, no enumeration signal.
  const identity = resolveRealIpRateLimitClientKey(request, {
    scope: 'auth.email_otp_start',
    logPrefix: 'email_otp_start',
    fallbackKey: EMAIL_OTP_START_FALLBACK_CLIENT_KEY,
  });
  if (!identity.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'proxy_configuration',
        message: 'Запрос должен проходить через reverse proxy с заголовком X-Real-IP.',
      },
      { status: 503 },
    );
  }
  if (await isEmailOtpStartRateLimitedByKey(identity.key)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'rate_limited',
        retryAfterSeconds: 60,
        message: formatOtpRetryAfterMessage(60),
      },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_email', message: 'Неверный формат email' },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const deps = buildAppDeps();
  let result;
  try {
    result = await startPublicEmailOtpChallenge(parsed.data.email, deps.emailOtpPublicDb);
  } catch {
    // Do not log the thrown error: provider messages may include email or OTP data. This fixed
    // event is enough for operators and keeps the public outcome indistinguishable.
    logger.warn(
      { route: 'auth/email-otp/start', outcome: 'email_delivery_exception' },
      'auth/email-otp/start delivery failed',
    );
    return publicEmailOtpStartAccepted(startedAt, randomUUID(), 60);
  }

  if (!result.ok) {
    switch (result.code) {
      case 'invalid_email':
        return NextResponse.json(
          { ok: false, error: 'invalid_email', message: 'Неверный формат email' },
          { status: 400 },
        );

      case 'rate_limited':
        // Per-email cooldown state exists only after a delivered challenge, so exposing it would
        // disclose whether an address has an account. The independent per-IP limiter above still
        // bounds all public requests and remains the only public rate-limit response.
        return publicEmailOtpStartAccepted(startedAt, randomUUID(), 60);

      default:
        return NextResponse.json(
          { ok: false, error: 'error', message: 'Не удалось отправить код. Попробуйте позже.' },
          { status: 500 },
        );
    }
  }

  if (result.deliveryFailed) {
    // Do not log raw email, OTP, or provider payload: this fixed event is sufficient operator
    // evidence while preserving the public neutral response.
    logger.warn(
      { route: 'auth/email-otp/start', outcome: 'email_delivery_failed' },
      'auth/email-otp/start delivery failed',
    );
  }

  return publicEmailOtpStartAccepted(startedAt, result.challengeId, result.retryAfterSeconds ?? 60);
}

async function publicEmailOtpStartAccepted(
  startedAt: number,
  challengeId: string,
  retryAfterSeconds: number,
): Promise<NextResponse> {
  const remainingMs = PUBLIC_EMAIL_OTP_START_MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remainingMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingMs));
  }
  return NextResponse.json({
    ok: true,
    challengeId,
    retryAfterSeconds,
  });
}
