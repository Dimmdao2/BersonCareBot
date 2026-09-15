/**
 * Корень брендированной поверхности: что показывает `/`, решает АДРЕС, с которого пришли.
 *
 * До 12.09.2026 это решала настройка организации `clinic_root_skip_public_card`, и этот файл был
 * её независимым аудитом (пункт `B5a` плана
 * `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`). Владелец снял и
 * настройку, и поведение, дословно: «app clinic ru не должен вести на публичную карточку клиники.
 * Он должен в любом случае открывать логин всегда. Публичная карточка клиники как была, так и
 * остаётся на поддомене therapygo.ru» и «Однозначно убирать поведение, которое сейчас есть. Да и
 * checkbox тоже однозначно убирать».
 *
 * Поэтому набор проверяет новый инвариант на том же месте: собственный домен клиники — её
 * приложение, платформенный поддомен — её визитка, и выбор между ними ничем снаружи не двигается.
 * Значения намеренно свои, отличные от авторских и от файла аудита `B5`.
 *
 * 15.09.2026 уточнён АДРЕС этого приложения: не общий выбор портала `/app`, а `/app/patient` —
 * тот же, что стоит `start_url` в манифесте установленного пациентского приложения. Владелец: «у
 * них в манифесте стартовая страница именно в веб-приложении — это app slash patient.
 * Соответственно, они должны туда и попасть». Корень ОБЫЧНОГО пациентского домена этим не
 * затронут и по-прежнему ведёт на `/app` — это проверяет отдельный случай ниже.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantSurfaceLookup } from '@/shared/lib/surface/requestSurface';

const tenantLookupRuntime = vi.hoisted(() => ({
  current: undefined as TenantSurfaceLookup | undefined,
}));

vi.mock('@/app-layer/surface/productionTenantSurfaceLookup', () => ({
  productionTenantSurfaceLookup: (hostname: string) =>
    (tenantLookupRuntime.current ?? (async () => ({ status: 'unknown' as const })))(hostname),
}));

const STAFF_ORIGIN = 'https://kabinet.b5a-audit.test';
const PATIENT_ORIGIN = 'https://priem.b5a-audit.test';
const CLINIC_ON_PLATFORM = 'ozero-clinic';
const CLINIC_ON_OWN_DOMAIN = 'sosnovy-bor';
const ORG_ON_PLATFORM = 'cccccccc-3333-4333-8333-cccccccccccc';
const ORG_ON_OWN_DOMAIN = 'dddddddd-4444-4444-8444-dddddddddddd';
const OWN_DOMAIN = 'app.sosnovy-bor.example';

async function loadRuntime() {
  vi.resetModules();
  vi.stubEnv('APP_BASE_URL', STAFF_ORIGIN);
  vi.stubEnv('PATIENT_APP_ORIGIN', PATIENT_ORIGIN);
  const [proxyModule, requestSurface, paths] = await Promise.all([
    import('@/proxy'),
    import('@/shared/lib/surface/requestSurface'),
    import('@/shared/publicBook/paths'),
  ]);
  return {
    proxy: (request: NextRequest, tenantLookup?: TenantSurfaceLookup) => {
      tenantLookupRuntime.current = tenantLookup;
      return proxyModule.proxy(request, {
        waitUntil: vi.fn(),
        passThroughOnException: vi.fn(),
      });
    },
    readResolvedSurface: requestSurface.readResolvedSurface,
    serializeResolvedSurface: requestSurface.serializeResolvedSurface,
    RESOLVED_SURFACE_HEADER: requestSurface.RESOLVED_SURFACE_HEADER,
    publicClinicCardPath: paths.publicClinicCardPath,
    publicBookPaths: paths.publicBookPaths,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * `ownDomain` НЕ имеет значения по умолчанию: отсутствие ключа — это клиника без собственного
 * домена, и именно так отвечает шов арендатора, а не `undefined`-полем.
 */
function tenantFor(
  slug: string,
  organizationId: string,
  ownDomain?: string,
): TenantSurfaceLookup {
  return async () => ({
    status: 'active',
    organizationId,
    clinicSlug: slug,
    ...(ownDomain ? { activeCustomDomainHostname: ownDomain } : {}),
    effectivePatientBrandOrganizationId: organizationId,
    effectivePatientBrand: {
      effectiveDisplayName: `Клиника ${slug}`,
      patientAppName: `${slug} приём`,
      accentToken: '#4a7c59',
    },
  });
}

function platformHost(slug: string): string {
  return `${slug}.${new URL(PATIENT_ORIGIN).hostname}`;
}

function requestFor(host: string, rawPath: string, extraHeaders?: Record<string, string>) {
  return new NextRequest(`https://${host}${rawPath}`, {
    headers: { host, 'x-forwarded-proto': 'https', ...extraHeaders },
  });
}

function routedPath(response: Response, requested: string): string {
  const rewrite = response.headers.get('x-middleware-rewrite');
  return rewrite ? new URL(rewrite).pathname : requested;
}

/**
 * Ловит: собственный домен клиники снова открывает визитку вместо входа — ровно то поведение,
 * которое владелец приказал убрать. Обратная поломка тоже ловится: платформенный поддомен клиники
 * без своего домена перестаёт показывать визитку и молча уводит всех её посетителей во вход.
 */
describe('корень брендированной поверхности выбирает адрес, а не настройка', () => {
  it('собственный домен клиники открывает вход в приложение', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(OWN_DOMAIN, '/'),
      tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN),
    );
    expect(response.status).toBe(200);
    expect(routedPath(response, '/')).toBe('/app/patient');
  });

  it('платформенный поддомен клиники без своего домена открывает визитку', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/'),
      tenantFor(CLINIC_ON_PLATFORM, ORG_ON_PLATFORM),
    );
    expect(response.status).toBe(200);
    expect(routedPath(response, '/')).toBe(runtime.publicClinicCardPath(CLINIC_ON_PLATFORM));
  });

  it('признак собственного домена ставится только при совпадении хоста запроса', async () => {
    const runtime = await loadRuntime();
    const own = await runtime.proxy(
      requestFor(OWN_DOMAIN, '/'),
      tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN),
    );
    expect(
      runtime.readResolvedSurface({
        get: (name) => own.headers.get(`x-middleware-request-${name}`),
      }),
    ).toMatchObject({ surface: 'patient_branded', brandedHostIsOwnDomain: true });

    const platform = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/'),
      tenantFor(CLINIC_ON_PLATFORM, ORG_ON_PLATFORM),
    );
    const resolvedPlatform = runtime.readResolvedSurface({
      get: (name) => platform.headers.get(`x-middleware-request-${name}`),
    });
    expect(resolvedPlatform?.surface).toBe('patient_branded');
    expect(resolvedPlatform?.brandedHostIsOwnDomain).toBeUndefined();
  });

  it('корень непациентского адреса этим решением не затронут', async () => {
    const runtime = await loadRuntime();
    const staff = await runtime.proxy(requestFor(new URL(STAFF_ORIGIN).host, '/'));
    expect(staff.status).toBe(200);
    expect(staff.headers.get('x-middleware-rewrite')).toBeNull();
    const plain = await runtime.proxy(requestFor(new URL(PATIENT_ORIGIN).host, '/'));
    expect(routedPath(plain, '/')).toBe('/app');
  });
});

/**
 * Ловит: собственный домен одного арендатора меняет корень другого — стена арендатора протекает
 * через решение о корне, и пациент чужой клиники попадает не на ту стартовую поверхность.
 */
describe('изоляция арендаторов на корне', () => {
  it('свой домен клиники A не меняет корень клиники B ни в каком порядке запросов', async () => {
    const runtime = await loadRuntime();
    const platform = tenantFor(CLINIC_ON_PLATFORM, ORG_ON_PLATFORM);
    const branded = tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN);

    const brandedFirst = await runtime.proxy(requestFor(OWN_DOMAIN, '/'), branded);
    const platformAfter = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/'),
      platform,
    );
    const platformFirst = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/'),
      platform,
    );
    const brandedAfter = await runtime.proxy(requestFor(OWN_DOMAIN, '/'), branded);

    expect(routedPath(brandedFirst, '/')).toBe('/app/patient');
    expect(routedPath(brandedAfter, '/')).toBe('/app/patient');
    const card = runtime.publicClinicCardPath(CLINIC_ON_PLATFORM);
    expect(routedPath(platformAfter, '/')).toBe(card);
    expect(routedPath(platformFirst, '/')).toBe(card);
  });
});

/**
 * Ловит: решение о корне расползлось за корень — у клиники на своём домене пропала короткая
 * запись `/booking` или вход пациента, либо наоборот.
 */
describe('решение касается только корня', () => {
  it.each([
    ['каноническая визитка', `/${CLINIC_ON_OWN_DOMAIN}`],
    ['вход пациента', '/app/patient/login'],
    ['общая оболочка входа', '/app'],
    ['поддержка', '/app/contact-support'],
  ])('%s не зависит от того, чей это адрес', async (_name, path) => {
    const runtime = await loadRuntime();
    const [own, platform] = await Promise.all([
      runtime.proxy(
        requestFor(OWN_DOMAIN, path),
        tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN),
      ),
      runtime.proxy(
        requestFor(platformHost(CLINIC_ON_OWN_DOMAIN), path),
        tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN),
      ),
    ]);
    expect(own.status).toBe(platform.status);
    expect(routedPath(own, path)).toBe(routedPath(platform, path));
    expect(own.status).toBe(200);
  });

  it('на своём домене короткая запись остаётся записью своей клиники', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(OWN_DOMAIN, '/booking'),
      tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN),
    );
    expect(routedPath(response, '/booking')).toBe(
      runtime.publicBookPaths.forSlug(CLINIC_ON_OWN_DOMAIN),
    );
  });
});

/**
 * Ловит: признак «это собственный домен» можно принести снаружи заголовком внутреннего контекста
 * и увести чужой корень во вход, минуя шов арендатора.
 */
describe('признак собственного домена нельзя принести запросом', () => {
  it('подделанный x-bc-resolved-surface не меняет корень клиники', async () => {
    const runtime = await loadRuntime();
    const forged = runtime.serializeResolvedSurface({
      surface: 'patient_branded',
      publicOrigin: `https://${platformHost(CLINIC_ON_PLATFORM)}`,
      organizationId: ORG_ON_PLATFORM,
      clinicSlug: CLINIC_ON_PLATFORM,
      brandedHostIsOwnDomain: true,
      effectivePatientBrand: {
        effectiveDisplayName: 'Подделка',
        patientAppName: 'Подделка',
        accentToken: '#000000',
      },
      authPolicy: { availableMethods: ['email_code'], enabledMethods: ['email_code'] },
    });
    const response = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/', {
        [runtime.RESOLVED_SURFACE_HEADER]: forged,
      }),
      tenantFor(CLINIC_ON_PLATFORM, ORG_ON_PLATFORM),
    );
    expect(routedPath(response, '/')).toBe(runtime.publicClinicCardPath(CLINIC_ON_PLATFORM));
    const resolved = runtime.readResolvedSurface({
      get: (name) => response.headers.get(`x-middleware-request-${name}`),
    });
    expect(resolved?.brandedHostIsOwnDomain).toBeUndefined();
  });

  it('признак на непациентской поверхности отвергает разбор целиком', async () => {
    const runtime = await loadRuntime();
    const value = encodeURIComponent(
      JSON.stringify({
        surface: 'patient_default',
        publicOrigin: PATIENT_ORIGIN,
        brandedHostIsOwnDomain: true,
        authPolicy: { availableMethods: ['email_code'], enabledMethods: ['email_code'] },
      }),
    );
    expect(runtime.readResolvedSurface({ get: () => value })).toBeNull();
  });
});

/**
 * Ловит: правка уронила `B4a`/`B5` — живой корень клиники без купленного бренда снова 404, либо
 * неизвестный/погашенный/дублирующий хост перестал отдавать 404.
 */
describe('B4a и B5 целы', () => {
  it.each([
    ['неизвестная метка', { status: 'unknown' as const }],
    ['неактивная организация', { status: 'inactive' as const }],
    ['дубль хоста', { status: 'duplicate' as const }],
  ])('%s -> 404 на весь хост', async (_name, result) => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(platformHost(CLINIC_ON_PLATFORM), '/'),
      async () => result,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('чужое происхождение бренда -> 404 и на собственном домене', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(OWN_DOMAIN, '/'),
      async () => ({
        status: 'active',
        organizationId: ORG_ON_OWN_DOMAIN,
        clinicSlug: CLINIC_ON_OWN_DOMAIN,
        activeCustomDomainHostname: OWN_DOMAIN,
        effectivePatientBrandOrganizationId: ORG_ON_PLATFORM,
        effectivePatientBrand: {
          effectiveDisplayName: 'Чужая клиника',
          patientAppName: 'Чужая клиника',
          accentToken: '#222222',
        },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('каталог специалистов и лендинг остаются недостижимы с собственного домена', async () => {
    const runtime = await loadRuntime();
    for (const path of ['/specialists', '/specialist']) {
      const response = await runtime.proxy(
        requestFor(OWN_DOMAIN, path),
        tenantFor(CLINIC_ON_OWN_DOMAIN, ORG_ON_OWN_DOMAIN, OWN_DOMAIN),
      );
      expect(`${path} -> ${response.status}`).toBe(`${path} -> 404`);
    }
  });
});
