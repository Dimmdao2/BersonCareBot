import { NextResponse } from 'next/server';
import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { isOnDemandTlsHostnameAuthorized } from './onDemandTlsAuthorization';

/**
 * Обработчик Caddy `on_demand_tls` `ask` (C5a, B7 без wildcard). Живёт МОДУЛЕМ, а не маршрутом:
 * адрес у этой двери ровно один — `/api/public/domains/ask`. Раньше тот же обработчик был выставлен
 * ещё и под `/api/internal/domains/ask`, то есть наружу без входа смотрели два адреса вместо одного
 * (перепись открытых дверей 16.09.2026).
 *
 * Строка источника оставлена прежней, но НЕ по той причине, которую сначала записал ведущий.
 * Независимый аудит (`docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_2026-09-16.md`, MUST FIX 2) это опроверг
 * прогоном: переименование строки не покраснило ни один из 33 названных тестов, потому что
 * `stampBootstrapPrincipal` ставит принципал вида `bootstrap`, а `WEBAPP_LOCKED_INFRA_CRON_SOURCES`
 * применяется только к `infra`. Роль здесь выбирают ДВА других пути, и именно их нельзя ломать:
 *   — поддомен платформы идёт bootstrap-корнем `app.resolve_public_organization_by_slug(text)` под
 *     `app_pre_session` (в этом и был прошлый инцидент: под infra-принципалом каждое имя получало
 *     `permission denied for function`, и сертификат не выпускался ни для одной клиники);
 *   — собственный домен клиники в `onDemandTlsAuthorization.ts` отдельно переключается на
 *     infra-источник `ondemand-tls:custom-domain`, а его именованный корень
 *     `app.custom_domain_ask_is_authorized(text)` объявлен в `declaration.ts` как `service` с
 *     `targetRole: app_worker`.
 * Строку менять по-прежнему незачем, но проверять надо эти два пути, а не её.
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
export async function handleOnDemandTlsAskRequest(request: Request) {
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
