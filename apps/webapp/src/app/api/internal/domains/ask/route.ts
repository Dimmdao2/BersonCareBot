import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';

/**
 * GET — Caddy `on_demand_tls` `ask` authorization for a custom-domain hostname (C5a).
 * Caddy's built-in permission request is headerless. Authorization is the exact normalized host
 * lookup behind the binding port; this route intentionally reveals no tenant state.
 *
 * This endpoint answers exactly one question: "are we willing to request a TLS certificate for this
 * hostname". It never probes DNS and never claims a certificate exists — that boundary belongs to a
 * later verifier/edge integration, not this request path (reopening ruling, #787).
 *
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get('domain');
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'missing_domain' }, { status: 400 });
  }

  enterWithDbInfraPrincipal({ source: 'api/internal/domains/ask:GET' });
  const deps = buildAppDeps();
  if (!deps.customDomainBinding) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  try {
    const authorized = await deps.customDomainBinding.isHostnameAskAuthorized(domain);
    if (!authorized) {
      return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[internal/domains/ask] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
