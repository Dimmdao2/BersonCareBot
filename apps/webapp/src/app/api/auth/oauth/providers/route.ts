import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';
import { OAUTH_PROVIDERS, type OAuthProviderFlags } from '@/modules/auth/oauthProviderRegistry';

/**
 * GET /api/auth/oauth/providers — какие провайдеры настроены (без секретов).
 * Every provider requires its independent admin toggle AND complete credentials.
 */
const ROUTE = 'auth/oauth/providers';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/providers:GET', request);
  const startedAt = Date.now();
  const entries = await Promise.all(
    OAUTH_PROVIDERS.map(async (provider) => [provider, await isOAuthProviderEnabled(provider)] as const),
  );
  const providerFlags = Object.fromEntries(entries) as OAuthProviderFlags;

  const res = NextResponse.json({ ok: true, ...providerFlags });
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
