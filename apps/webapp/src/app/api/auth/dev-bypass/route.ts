import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import { getPostAuthRedirectTarget } from '@/modules/auth/redirectPolicy';
import { getRequestOrigin } from '@/shared/lib/http/getRequestOrigin';
import { isDevAuthBypassEnabled } from '@/modules/auth/devBypassPolicy';

const DEV_BYPASS_TOKENS = new Set([
  'dev:client',
  'dev:doctor',
  'dev:clinic-admin',
  'dev:admin',
  'dev:doctor-isolated',
  'dev:client-isolated',
  'dev:doctor-colleague',
  'dev:client-colleague',
]);

function redirectToPath(path: string, origin: string): NextResponse {
  return NextResponse.redirect(new URL(path, origin), { status: 303 });
}

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/dev-bypass:GET', request);
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request, requestUrl);

  if (
    !isDevAuthBypassEnabled({
      nodeEnv: env.NODE_ENV,
      allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
    })
  ) {
    return redirectToPath('/app', origin);
  }

  const token = requestUrl.searchParams.get('token')?.trim() ?? '';
  if (!DEV_BYPASS_TOKENS.has(token)) {
    return redirectToPath('/app', origin);
  }

  const deps = buildAppDeps();
  const result = await deps.auth.exchangeIntegratorToken(token);
  if (!result) {
    return redirectToPath('/app', origin);
  }

  const target = getPostAuthRedirectTarget(
    result.session.user.role,
    requestUrl.searchParams.get('next'),
    result.redirectTo,
  );
  return redirectToPath(target, origin);
}
