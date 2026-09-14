import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
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

  /* Резолвер слага — SECURITY DEFINER, выполнять его вправе только `app_pre_session`, и приложение
     берёт эту роль из bootstrap-принципала. Здесь стоял infra-принципал, и КАЖДОЕ имя под нашим
     апексом получало `permission denied for function` → 500 вместо честного да/нет, то есть
     on-demand выпуск сертификата не мог сработать ни для одной клиники. Собственный домен клиники
     идёт своей дверью и остаётся на infra — ровно как в `productionTenantSurfaceLookup`. */
  stampBootstrapPrincipal('api/internal/domains/ask:GET', request);
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
    logger.error({ operatorErrorDetail: e }, '[internal/domains/ask] failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
