import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { isOnDemandTlsHostnameAuthorized } from '@/app-layer/surface/onDemandTlsAuthorization';

/**
 * GET — Caddy `on_demand_tls` `ask` authorization (C5a, B7 без wildcard).
 * Caddy's built-in permission request is headerless. Authorization is the exact normalized host
 * lookup; this route intentionally reveals no tenant state.
 *
 * С 12.09.2026 сюда приходит не только собственный домен клиники, но и её поддомен
 * `<slug>.therapygo.ru`: wildcard-сертификата больше нет (владелец не даёт API регистратора), и
 * каждое имя выпускается по себе. Само правило — одно, в `onDemandTlsAuthorization.ts`.
 *
 * This endpoint answers exactly one question: "are we willing to request a TLS certificate for this
 * hostname". It never probes DNS and never claims a certificate exists — the scheduled/owner-triggered
 * readiness verifier owns those checks, not this request path.
 *
 */
export async function GET(request: Request) {
  const domain = new URL(request.url).searchParams.get('domain');
  if (!domain) {
    return NextResponse.json({ ok: false, error: 'missing_domain' }, { status: 400 });
  }

  enterWithDbInfraPrincipal({ source: 'api/internal/domains/ask:GET' });
  const deps = buildAppDeps();
  if (!deps.customDomainBinding && !deps.clinicDirectory) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }

  try {
    const authorized = await isOnDemandTlsHostnameAuthorized(domain, {
      customDomainBinding: deps.customDomainBinding,
      clinicDirectory: deps.clinicDirectory,
    });
    if (!authorized) {
      return NextResponse.json({ ok: false, error: 'not_authorized' }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ err: e }, '[internal/domains/ask] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
