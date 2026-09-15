import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { logAuthRouteTiming } from '@/modules/auth/authRouteObservability';
import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';

const ROUTE = 'auth/login/alternatives-config';

/** GET — public alternatives projection for external login clients, without secrets. */
export async function GET(request: Request) {
  stampBootstrapPrincipal('api/auth/login/alternatives-config:GET', request);
  const startedAt = Date.now();
  try {
    const config = await buildPrefetchedPublicAuthConfig();
    const res = NextResponse.json({
      ok: true as const,
      telegramBotUsername: config.telegramBotUsername,
      maxBotOpenUrl: config.maxBotOpenUrl,
      vkWebLoginUrl: config.vkWebLoginUrl,
      smsFallbackEnabled: config.smsFallbackEnabled,
      authChannelPolicy: config.authChannelPolicy,
      specialistSignupEnabled: config.specialistSignupEnabled,
    });
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 200,
      outcome: 'ok',
    });
    return res;
  } catch (error) {
    const res = NextResponse.json(
      { ok: false as const, error: 'config_unavailable' },
      { status: 500 },
    );
    logAuthRouteTiming({
      route: ROUTE,
      request,
      startedAt,
      status: 500,
      outcome: 'error',
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return res;
  }
}
