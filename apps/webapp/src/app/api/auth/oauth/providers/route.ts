import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';

const ROUTE = 'auth/oauth/providers';

/** GET — public OAuth provider projection for external login clients, without secrets. */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/providers:GET', request);
  const startedAt = Date.now();
  const config = await buildPrefetchedPublicAuthConfig();
  const res = NextResponse.json({ ok: true as const, ...config.oauthProviders });
  res.headers.set('Cache-Control', 'private, no-store');
  logAuthRouteTiming({
    route: ROUTE,
    request,
    startedAt,
    status: 200,
    outcome: 'ok',
  });
  return res;
}
