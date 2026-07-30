import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { ensureAuthModulePortsBound } from '@/app-layer/di/bindAuthModulePorts';
import { requireStaffSecurityApiSession } from '@/app-layer/guards/requireRole';
import { normalizeEmail } from '@/modules/auth/emailAuth';
import {
  AUTH_CONFIRM_RATE_LIMIT_SEC,
  checkAuthConfirmRateLimit,
} from '@/modules/auth/authConfirmRateLimit';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };
export async function POST(request: Request) {
  stampBootstrapPrincipal('api/account/security/password/change/challenge:POST', request);
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) {
    gate.response.headers.set('Cache-Control', 'no-store');
    return gate.response;
  }
  ensureAuthModulePortsBound();
  const rateLimit = await checkAuthConfirmRateLimit(request, 'account_password_change_challenge');
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

  const deps = buildAppDeps();
  const email = await deps.userByPhone.getVerifiedEmailForUser(gate.session.user.userId);
  const challenge = email ? await deps.passwordAltcha.issue(normalizeEmail(email)) : null;
  if (!challenge) {
    return NextResponse.json(
      { ok: false, error: 'challenge_unavailable' },
      { status: 409, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json({ ok: true, ...challenge }, { headers: NO_STORE_HEADERS });
}
