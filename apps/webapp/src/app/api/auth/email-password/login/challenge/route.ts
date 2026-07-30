import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';

const bodySchema = z.object({ email: z.string().email().max(320) });
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  stampBootstrapPrincipal('api/auth/email-password/login/challenge:POST', request);
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'email_password_login_challenge');
  if (rateLimit.limited) {
    return NextResponse.json(
      {
        ok: false,
        error:
          rateLimit.reason === 'proxy_configuration'
            ? 'challenge_unavailable'
            : 'rate_limited',
        retryAfterSeconds: AUTH_CONFIRM_RATE_LIMIT_SEC,
      },
      {
        status: rateLimit.reason === 'proxy_configuration' ? 503 : 429,
        headers: {
          ...NO_STORE_HEADERS,
          ...(rateLimit.reason === 'proxy_configuration'
            ? {}
            : { 'Retry-After': String(AUTH_CONFIRM_RATE_LIMIT_SEC) }),
        },
      },
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const challenge = await buildAppDeps().passwordAltcha.issue(
    normalizeEmail(parsed.data.email),
  );
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: 'challenge_unavailable' },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true, ...challenge }, { headers: NO_STORE_HEADERS });
}
