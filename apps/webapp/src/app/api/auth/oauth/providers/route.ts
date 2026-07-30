import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import { isOAuthProviderEnabled } from '@/modules/auth/authChannelPolicy';

/**
 * GET /api/auth/oauth/providers — какие провайдеры настроены (без секретов).
 * Google / Yandex: independent admin toggle AND credentials configured (owner ruling 2026-07-24).
 * Apple is not an allowed login provider (owner ruling 2026-07-24).
 */
const ROUTE = 'auth/oauth/providers';

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/oauth/providers:GET', request);
  const startedAt = Date.now();
  const [yandex, google] = await Promise.all([
    isOAuthProviderEnabled('yandex'),
    isOAuthProviderEnabled('google'),
  ]);

  const res = NextResponse.json({ ok: true, yandex, google, apple: false });
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
