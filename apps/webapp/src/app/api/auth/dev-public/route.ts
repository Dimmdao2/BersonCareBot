import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import { isDevAuthBypassEnabled } from '@/modules/auth/devBypassPolicy';
import { getRequestOrigin } from '@/shared/lib/http/getRequestOrigin';
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from '@/shared/lib/platform';
import { NextResponse } from 'next/server';

/** Dev-only switch to a clean unauthenticated public/login or specialist-registration surface. */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/dev-public:GET');
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request, requestUrl);

  if (!isDevAuthBypassEnabled({
    nodeEnv: env.NODE_ENV,
    allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
  })) {
    return NextResponse.redirect(new URL('/app', origin), { status: 303 });
  }

  await buildAppDeps().auth.clearSession();
  const target = requestUrl.searchParams.get('view') === 'registration'
    ? '/app?devView=registration'
    : '/app';
  const response = NextResponse.redirect(new URL(target, origin), { status: 303 });
  for (const name of [PLATFORM_COOKIE_NAME, MESSENGER_SURFACE_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: '',
      path: '/',
      maxAge: 0,
      sameSite: 'lax',
    });
  }
  return response;
}
