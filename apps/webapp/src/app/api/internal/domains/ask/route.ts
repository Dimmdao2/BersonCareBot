import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';

/**
 * GET — Caddy `on_demand_tls` `ask` authorization for a custom-domain hostname (C5a).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`, same convention as every other
 * `/api/internal/**` route (`middleware/internalJobBearer.ts`).
 *
 * This endpoint answers exactly one question: "are we willing to request a TLS certificate for this
 * hostname". It never probes DNS and never claims a certificate exists — that boundary belongs to a
 * later verifier/edge integration, not this request path (reopening ruling, #787).
 *
 * KNOWN GAP (documented, not silently solved): Caddy's `on_demand_tls.ask` directive issues a plain
 * `GET /ask?domain=<host>` with no application-controlled headers, so wiring the real Caddy config
 * (out of scope here — this worker does not edit deploy/Caddy files) to actually send this bearer is
 * unresolved. Whoever wires the live edge must either extend Caddy's ask request with the shared
 * secret (newer Caddy versions support custom ask headers) or front this route with a
 * network-position trust boundary instead of the bearer. This route stays fail-closed on the bearer
 * in the meantime rather than silently trusting an unauthenticated caller.
 */
export async function GET(request: Request) {
  const auth = verifyInternalJobBearer(request);
  if (!auth.ok) return auth.response;

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
