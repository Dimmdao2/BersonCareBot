import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { env } from '@/config/env';
import { isDevAuthBypassEnabled } from '@/modules/auth/devBypassPolicy';
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';
import { MESSENGER_SURFACE_COOKIE_NAME, PLATFORM_COOKIE_NAME } from '@/shared/lib/platform';
import { NextResponse } from 'next/server';

const REGISTRATION_VIEWS = new Set([
  'registration',
  'specialist-registration',
  'clinic-registration',
]);

/** Dev-only switch to a clean unauthenticated public/login or combined specialist+clinic registration surface. */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/dev-public:GET', request);
  const requestUrl = new URL(request.url);
  const origin = requireResolvedSurface(request.headers).publicOrigin;

  if (
    !isDevAuthBypassEnabled({
      nodeEnv: env.NODE_ENV,
      allowDevAuthBypass: env.ALLOW_DEV_AUTH_BYPASS,
    })
  ) {
    return NextResponse.redirect(new URL('/app', origin), { status: 303 });
  }

  await buildAppDeps().auth.clearSession();
  const target = REGISTRATION_VIEWS.has(requestUrl.searchParams.get('view') ?? '')
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
