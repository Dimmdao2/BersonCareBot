import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';

/**
 * GET /api/auth/oauth/providers — какие провайдеры настроены (без секретов).
 * Every provider requires its independent admin toggle AND complete credentials.
 */
const ROUTE = 'auth/oauth/providers';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/providers:GET', request);
  const startedAt = Date.now();
  const [yandex, google, apple, vk] = await Promise.all([
    isOAuthProviderEnabled('yandex'),
    isOAuthProviderEnabled('google'),
    isOAuthProviderEnabled('apple'),
    isOAuthProviderEnabled('vk'),
  ]);

  const res = NextResponse.json({ ok: true, yandex, google, apple, vk });
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
