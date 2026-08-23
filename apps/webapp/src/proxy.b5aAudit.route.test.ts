/**
 * Независимый аудит пункта `B5a` (org-scoped флаг «сразу вход, визитку не показывать») плана
 * `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
 *
 * Значения намеренно свои, отличные и от авторских, и от файла аудита `B5`: другой пациентский
 * домен, другие метки клиник, другие идентификаторы организаций. Ловимая поломка названа в
 * заголовке каждого `describe`.
 *
 * Ключевое отличие от авторского набора: здесь «не задано» — это ОТСУТСТВИЕ поля в результате
 * шва арендатора, а не `false`. Это разные случаи: первый описывает клинику, которая настройки
 * никогда не касалась, второй — ту, что её осознанно выключила.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantSurfaceLookup } from '@/shared/lib/surface/requestSurface';

const STAFF_ORIGIN = 'https://kabinet.b5a-audit.test';
const PATIENT_ORIGIN = 'https://priem.b5a-audit.test';
const CLINIC_KEEPS_CARD = 'ozero-clinic';
const CLINIC_SKIPS_CARD = 'sosnovy-bor';
const ORG_KEEPS_CARD = 'cccccccc-3333-4333-8333-cccccccccccc';
const ORG_SKIPS_CARD = 'dddddddd-4444-4444-8444-dddddddddddd';

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
    proxy: proxyModule.proxy,
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
 * `rootChoice` не имеет значения по умолчанию НАМЕРЕННО: `omit` строит результат без ключа
 * вообще — ровно то, что вернёт шов для клиники, у которой строки настройки нет.
 */
function tenantFor(
  slug: string,
  organizationId: string,
  rootChoice: { readonly kind: 'omit' } | { readonly kind: 'value'; readonly value: unknown },
): TenantSurfaceLookup {
  return async () => ({
    status: 'active',
    organizationId,
    clinicSlug: slug,
    ...(rootChoice.kind === 'omit'
      ? {}
      : { skipPublicCardAtRoot: rootChoice.value as boolean | undefined }),
    effectivePatientBrandOrganizationId: organizationId,
    effectivePatientBrand: {
      effectiveDisplayName: `Клиника ${slug}`,
      patientAppName: `${slug} приём`,
      accentToken: '#4a7c59',
    },
  });
}

const UNSET = { kind: 'omit' } as const;
const OFF = { kind: 'value', value: false } as const;
const ON = { kind: 'value', value: true } as const;

function brandedHost(slug: string): string {
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
 * Ловит: клиника, которая настройку НИКОГДА не задавала, после правки перестаёт получать визитку
 * на корне своего брендированного адреса. Последствие — молчаливая смена стартовой страницы у
 * всех арендаторов разом при первом же деплое.
 */
describe('B5a · дефолт: не задано ведёт себя ровно как раньше', () => {
  it.each([
    ['поле отсутствует в результате шва', UNSET],
    ['поле явно выключено', OFF],
    ['поле undefined', { kind: 'value', value: undefined } as const],
    ['поле null', { kind: 'value', value: null } as const],
    ['строка "true" вместо булева', { kind: 'value', value: 'true' } as const],
    ['единица вместо булева', { kind: 'value', value: 1 } as const],
  ])('%s -> визитка клиники', async (_name, choice) => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'),
      tenantFor(CLINIC_KEEPS_CARD, ORG_KEEPS_CARD, choice),
    );
    expect(response.status).toBe(200);
    expect(routedPath(response, '/')).toBe(runtime.publicClinicCardPath(CLINIC_KEEPS_CARD));
  });

  it('включённый флаг ведёт корень на общий вход', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_SKIPS_CARD), '/'),
      tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, ON),
    );
    expect(response.status).toBe(200);
    expect(routedPath(response, '/')).toBe('/app');
  });

  it('корень непациентского адреса флаг не трогает', async () => {
    const runtime = await loadRuntime();
    const staff = await runtime.proxy(requestFor(new URL(STAFF_ORIGIN).host, '/'));
    expect(staff.status).toBe(200);
    expect(staff.headers.get('x-middleware-rewrite')).toBeNull();
    const plain = await runtime.proxy(requestFor(new URL(PATIENT_ORIGIN).host, '/'));
    expect(routedPath(plain, '/')).toBe('/app');
  });
});

/**
 * Ловит: включённый флаг одного арендатора меняет корень другого — стена арендатора протекает
 * через новую настройку, и пациент чужой клиники попадает не на ту стартовую поверхность.
 */
describe('B5a · изоляция арендаторов', () => {
  it('включённый флаг клиники A не меняет корень клиники B ни в каком порядке запросов', async () => {
    const runtime = await loadRuntime();
    const withCard = tenantFor(CLINIC_KEEPS_CARD, ORG_KEEPS_CARD, UNSET);
    const withoutCard = tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, ON);

    const skipFirst = await runtime.proxy(requestFor(brandedHost(CLINIC_SKIPS_CARD), '/'), withoutCard);
    const cardAfter = await runtime.proxy(requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'), withCard);
    const cardFirst = await runtime.proxy(requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'), withCard);
    const skipAfter = await runtime.proxy(requestFor(brandedHost(CLINIC_SKIPS_CARD), '/'), withoutCard);

    expect(routedPath(skipFirst, '/')).toBe('/app');
    expect(routedPath(skipAfter, '/')).toBe('/app');
    expect(routedPath(cardAfter, '/')).toBe(runtime.publicClinicCardPath(CLINIC_KEEPS_CARD));
    expect(routedPath(cardFirst, '/')).toBe(runtime.publicClinicCardPath(CLINIC_KEEPS_CARD));
  });

  it('решение корня берётся из своего арендатора, а не из соседнего хоста', async () => {
    const runtime = await loadRuntime();
    // Шов отвечает по нормализованному имени хоста: подмена ответа на чужой хост здесь
    // невозможна, но результат обязан относиться к запрошенной метке.
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'),
      tenantFor(CLINIC_KEEPS_CARD, ORG_KEEPS_CARD, ON),
    );
    expect(routedPath(response, '/')).toBe('/app');
    const resolved = runtime.readResolvedSurface({
      get: (name) => response.headers.get(`x-middleware-request-${name}`),
    });
    expect(resolved).toMatchObject({
      surface: 'patient_branded',
      clinicSlug: CLINIC_KEEPS_CARD,
      organizationId: ORG_KEEPS_CARD,
      skipPublicCardAtRoot: true,
    });
  });
});

/**
 * Ловит: флаг расползся за корень — включив его, клиника теряет визитку по канонической метке,
 * короткую запись `/booking` или вход пациента. Пункт разрешает менять только корень.
 */
describe('B5a · флаг меняет только корень', () => {
  it.each([
    ['каноническая визитка', `/${CLINIC_SKIPS_CARD}`],
    ['короткая запись', '/booking'],
    ['вход пациента', '/app/patient/login'],
    ['общая оболочка входа', '/app'],
    ['поддержка', '/app/contact-support'],
  ])('%s не зависит от флага', async (_name, path) => {
    const runtime = await loadRuntime();
    const [on, off] = await Promise.all([
      runtime.proxy(
        requestFor(brandedHost(CLINIC_SKIPS_CARD), path),
        tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, ON),
      ),
      runtime.proxy(
        requestFor(brandedHost(CLINIC_SKIPS_CARD), path),
        tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, UNSET),
      ),
    ]);
    expect(on.status).toBe(off.status);
    expect(routedPath(on, path)).toBe(routedPath(off, path));
    expect(on.status).toBe(200);
  });

  it('включённый флаг оставляет короткую запись на записи своей клиники', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_SKIPS_CARD), '/booking'),
      tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, ON),
    );
    expect(routedPath(response, '/booking')).toBe(
      runtime.publicBookPaths.forSlug(CLINIC_SKIPS_CARD),
    );
  });
});

/**
 * Ловит: значение флага можно принести снаружи заголовком внутреннего контекста и увести чужой
 * корень на вход, минуя шов арендатора.
 */
describe('B5a · значение флага нельзя принести запросом', () => {
  it('подделанный x-bc-resolved-surface не меняет корень клиники', async () => {
    const runtime = await loadRuntime();
    const forged = runtime.serializeResolvedSurface({
      surface: 'patient_branded',
      publicOrigin: `https://${brandedHost(CLINIC_KEEPS_CARD)}`,
      organizationId: ORG_KEEPS_CARD,
      clinicSlug: CLINIC_KEEPS_CARD,
      skipPublicCardAtRoot: true,
      effectivePatientBrand: {
        effectiveDisplayName: 'Подделка',
        patientAppName: 'Подделка',
        accentToken: '#000000',
      },
      authPolicy: { availableMethods: ['email_code'], enabledMethods: ['email_code'] },
    });
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_KEEPS_CARD), '/', {
        [runtime.RESOLVED_SURFACE_HEADER]: forged,
      }),
      tenantFor(CLINIC_KEEPS_CARD, ORG_KEEPS_CARD, UNSET),
    );
    expect(routedPath(response, '/')).toBe(runtime.publicClinicCardPath(CLINIC_KEEPS_CARD));
    const resolved = runtime.readResolvedSurface({
      get: (name) => response.headers.get(`x-middleware-request-${name}`),
    });
    expect(resolved).toMatchObject({ skipPublicCardAtRoot: false });
  });

  it('флаг на непациентской поверхности отвергает разбор целиком', async () => {
    const runtime = await loadRuntime();
    const value = encodeURIComponent(
      JSON.stringify({
        surface: 'patient_default',
        publicOrigin: PATIENT_ORIGIN,
        skipPublicCardAtRoot: true,
        authPolicy: { availableMethods: ['email_code'], enabledMethods: ['email_code'] },
      }),
    );
    expect(runtime.readResolvedSurface({ get: () => value })).toBeNull();
  });
});

/**
 * Ловит: `B5a` уронил `B4a`/`B5` — живой корень клиники без купленного бренда снова 404,
 * либо неизвестный/погашенный/дублирующий хост перестал отдавать 404.
 */
describe('B5a · B4a и B5 целы', () => {
  it.each([
    ['неизвестная метка', { status: 'unknown' as const }],
    ['неактивная организация', { status: 'inactive' as const }],
    ['дубль хоста', { status: 'duplicate' as const }],
  ])('%s -> 404 на весь хост', async (_name, result) => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'),
      async () => result,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('чужое происхождение бренда -> 404 даже при включённом флаге', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_KEEPS_CARD), '/'),
      async () => ({
        status: 'active',
        organizationId: ORG_KEEPS_CARD,
        clinicSlug: CLINIC_KEEPS_CARD,
        skipPublicCardAtRoot: true,
        effectivePatientBrandOrganizationId: ORG_SKIPS_CARD,
        effectivePatientBrand: {
          effectiveDisplayName: 'Чужая клиника',
          patientAppName: 'Чужая клиника',
          accentToken: '#222222',
        },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('каталог специалистов и лендинг остаются недостижимы при включённом флаге', async () => {
    const runtime = await loadRuntime();
    for (const path of ['/specialists', '/specialist']) {
      const response = await runtime.proxy(
        requestFor(brandedHost(CLINIC_SKIPS_CARD), path),
        tenantFor(CLINIC_SKIPS_CARD, ORG_SKIPS_CARD, ON),
      );
      expect(`${path} -> ${response.status}`).toBe(`${path} -> 404`);
    }
  });
});
