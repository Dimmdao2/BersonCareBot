/**
 * Независимый аудит пункта `B5` (одно пациентское дерево) плана
 * `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
 *
 * Значения здесь намеренно свои, не авторские: другой пациентский домен, другие метки клиник.
 * Ловимая поломка у каждой группы названа в заголовке `describe`.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import type { AppSession, UserRole } from '@/shared/types/session';
import type { TenantSurfaceLookup } from '@/shared/lib/surface/requestSurface';

const STAFF_ORIGIN = 'https://stf.audit.test';
const PATIENT_ORIGIN = 'https://pat.audit.test';
const CLINIC_ONE = 'zarya-med';
const CLINIC_TWO = 'bereg-clinic';
const ORG_ONE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORG_TWO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

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
    publicClinicCardPath: paths.publicClinicCardPath,
    publicBookPaths: paths.publicBookPaths,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function tenantFor(
  slug: string,
  organizationId: string,
  skipPublicCardAtRoot = false,
): TenantSurfaceLookup {
  return async () => ({
    status: 'active',
    organizationId,
    clinicSlug: slug,
    skipPublicCardAtRoot,
    effectivePatientBrandOrganizationId: organizationId,
    effectivePatientBrand: {
      effectiveDisplayName: `Клиника ${slug}`,
      patientAppName: `${slug} забота`,
      accentToken: '#2b6cb0',
    },
  });
}

const TENANT_ONE = tenantFor(CLINIC_ONE, ORG_ONE);
const TENANT_TWO = tenantFor(CLINIC_TWO, ORG_TWO);
const TENANT_ONE_DIRECT_LOGIN = tenantFor(CLINIC_ONE, ORG_ONE, true);

function brandedHost(slug: string): string {
  return `${slug}.${new URL(PATIENT_ORIGIN).hostname}`;
}

function requestFor(host: string, rawPath: string, role?: UserRole): NextRequest {
  const headers: Record<string, string> = { host, 'x-forwarded-proto': 'https' };
  if (role) {
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: { userId: `audit-${role}`, role, displayName: role, bindings: {} },
      issuedAt: now,
      expiresAt: now + 3600,
    };
    headers.cookie = `${SESSION_COOKIE_NAME}=${encodeSessionCookie(session)}`;
  }
  // Строка URL, а не `new URL(path, origin)`: так кодированные и двойные слэши доезжают дословно.
  return new NextRequest(`https://${host}${rawPath}`, { headers });
}

function routedPath(response: Response, requested: string): string {
  const rewrite = response.headers.get('x-middleware-rewrite');
  return rewrite ? new URL(rewrite).pathname : requested;
}

type SurfaceCase = Readonly<{
  label: string;
  host: string;
  tenant?: TenantSurfaceLookup;
  expectedSurface: 'patient_default' | 'patient_branded';
}>;

const PATIENT_SURFACES: readonly SurfaceCase[] = [
  { label: 'patient_default', host: new URL(PATIENT_ORIGIN).host, expectedSurface: 'patient_default' },
  {
    label: 'patient_branded',
    host: brandedHost(CLINIC_ONE),
    tenant: TENANT_ONE,
    expectedSurface: 'patient_branded',
  },
];

/**
 * Ловит: маршрут пункта `B5` перестал обслуживаться на одной из пациентских поверхностей
 * (404 или уход на чужую страницу) — молчаливый отказ, который видит только пациент этой клиники.
 */
describe('B5 · каждый маршрут пункта живёт на обеих пациентских поверхностях', () => {
  const ROUTES = [
    { name: 'вход пациента', path: '/app/patient/login', role: undefined },
    { name: 'общая оболочка входа', path: '/app', role: undefined },
    { name: 'восстановление/поддержка', path: '/app/contact-support', role: undefined },
    { name: 'визитка клиники по метке', path: `/${CLINIC_ONE}`, role: undefined },
    { name: 'запись по метке', path: `/${CLINIC_ONE}/booking`, role: undefined },
    { name: 'кабинет пациента', path: '/app/patient/cabinet', role: 'client' as UserRole },
    { name: 'публичная запись', path: '/book/some-specialist', role: undefined },
  ] as const;

  it.each(ROUTES)('$name доступен на обеих поверхностях без переписывания', async (route) => {
    const runtime = await loadRuntime();
    for (const surface of PATIENT_SURFACES) {
      const response = await runtime.proxy(
        requestFor(surface.host, route.path, route.role),
        surface.tenant,
      );
      expect(`${surface.label} ${route.path} -> ${response.status}`).toBe(
        `${surface.label} ${route.path} -> 200`,
      );
      expect(routedPath(response, route.path)).toBe(route.path);
      expect(
        runtime.readResolvedSurface({
          get: (name) => response.headers.get(`x-middleware-request-${name}`),
        }),
      ).toMatchObject({ surface: surface.expectedSurface });
    }
  });

  it('корень пациентского адреса ведёт на вход, корень брендированного — на визитку своей клиники', async () => {
    const runtime = await loadRuntime();
    const [plain, branded] = await Promise.all([
      runtime.proxy(requestFor(new URL(PATIENT_ORIGIN).host, '/')),
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE),
    ]);
    expect(plain.status).toBe(200);
    expect(branded.status).toBe(200);
    expect(routedPath(plain, '/')).toBe('/app');
    expect(routedPath(branded, '/')).toBe(runtime.publicClinicCardPath(CLINIC_ONE));
  });

  it('короткий /booking брендированного адреса ведёт на запись своей клиники', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/booking'), TENANT_ONE);
    expect(response.status).toBe(200);
    expect(routedPath(response, '/booking')).toBe(runtime.publicBookPaths.forSlug(CLINIC_ONE));
  });
});

/**
 * Ловит: корень брендированного адреса показывает визитку не той клиники, чей это адрес,
 * либо параллельную реализацию карточки вместо существующего `app/[clinicSlug]`.
 */
describe('B5 · визитка на корне — та же реализация и та же клиника', () => {
  it('каждый брендированный адрес отдаёт визитку СВОЕЙ клиники', async () => {
    const runtime = await loadRuntime();
    const [one, two] = await Promise.all([
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE),
      runtime.proxy(requestFor(brandedHost(CLINIC_TWO), '/'), TENANT_TWO),
    ]);
    expect(routedPath(one, '/')).toBe(`/${CLINIC_ONE}`);
    expect(routedPath(two, '/')).toBe(`/${CLINIC_TWO}`);
  });

  it('корень и канонический адрес визитки попадают в один и тот же маршрут и контекст', async () => {
    const runtime = await loadRuntime();
    const [root, canonical] = await Promise.all([
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE),
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), `/${CLINIC_ONE}`), TENANT_ONE),
    ]);
    expect(routedPath(root, '/')).toBe(routedPath(canonical, `/${CLINIC_ONE}`));
    const surfaceOf = (response: Response) =>
      response.headers.get('x-middleware-request-x-bc-resolved-surface');
    expect(surfaceOf(root)).toBe(surfaceOf(canonical));
    expect(canonical.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

/**
 * Ловит: новый org-scoped флаг либо меняет дефолт для клиник, которые его не задавали, либо
 * применяется к чужому branded host. Последствие — пациент видит не ту стартовую поверхность.
 */
describe('B5a · один org-scoped выбор корня брендированного адреса', () => {
  it('отсутствующий или выключенный флаг сохраняет визитку, а включённый ведёт на общий вход', async () => {
    const runtime = await loadRuntime();
    const [unset, disabled, enabled, patientDefault] = await Promise.all([
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), tenantFor(CLINIC_ONE, ORG_ONE)),
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE),
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE_DIRECT_LOGIN),
      runtime.proxy(requestFor(new URL(PATIENT_ORIGIN).host, '/')),
    ]);

    expect(routedPath(unset, '/')).toBe(runtime.publicClinicCardPath(CLINIC_ONE));
    expect(routedPath(disabled, '/')).toBe(runtime.publicClinicCardPath(CLINIC_ONE));
    expect(routedPath(enabled, '/')).toBe('/app');
    expect(routedPath(patientDefault, '/')).toBe('/app');
  });

  it('флаг одной организации не перенаправляет корень другой', async () => {
    const runtime = await loadRuntime();
    const [first, second] = await Promise.all([
      runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), TENANT_ONE_DIRECT_LOGIN),
      runtime.proxy(requestFor(brandedHost(CLINIC_TWO), '/'), TENANT_TWO),
    ]);

    expect(routedPath(first, '/')).toBe('/app');
    expect(routedPath(second, '/')).toBe(runtime.publicClinicCardPath(CLINIC_TWO));
  });
});

/**
 * Ловит: с пациентского адреса открывается лендинг Therapysto или каталог специалистов —
 * пациент клиники видит витрину платформы вместо своей клиники.
 */
describe('B5 · Therapysto home и каталог специалистов недостижимы с пациентских адресов', () => {
  it('корень пациентских адресов никогда не доезжает до корневой страницы лендинга', async () => {
    const runtime = await loadRuntime();
    for (const surface of PATIENT_SURFACES) {
      const response = await runtime.proxy(requestFor(surface.host, '/'), surface.tenant);
      expect(`${surface.label}: ${response.headers.get('x-middleware-rewrite') ? 'rewritten' : 'landing'}`).toBe(
        `${surface.label}: rewritten`,
      );
    }
    const staff = await runtime.proxy(requestFor(new URL(STAFF_ORIGIN).host, '/'));
    expect(staff.status).toBe(200);
    expect(staff.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it.each([
    ['прямой путь', '/specialists'],
    ['единственное число', '/specialist'],
    ['хвостовой слэш', '/specialists/'],
    ['двойной хвостовой слэш', '/specialists//'],
  ])('каталог закрыт: %s', async (_name, path) => {
    const runtime = await loadRuntime();
    for (const surface of PATIENT_SURFACES) {
      const response = await runtime.proxy(requestFor(surface.host, path), surface.tenant);
      expect(`${surface.label} ${path} -> ${response.status}`).toBe(`${surface.label} ${path} -> 404`);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('каталог остаётся достижим на staff-поверхности', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(requestFor(new URL(STAFF_ORIGIN).host, '/specialists'));
    expect(response.status).toBe(200);
  });
});

/**
 * Ловит: `B5` уронил `B4a` — живой адрес клиники без купленного бренда снова отдаёт 404,
 * либо, наоборот, чужой/неизвестный/погашенный адрес перестал отдавать 404.
 */
describe('B5 · B4a цел', () => {
  it.each([
    ['неизвестная метка', { status: 'unknown' as const }],
    ['неактивная организация', { status: 'inactive' as const }],
    ['дубль хоста', { status: 'duplicate' as const }],
  ])('%s -> 404 на весь хост', async (_name, result) => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(requestFor(brandedHost(CLINIC_ONE), '/'), async () => result);
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('чужое происхождение бренда -> 404, бренд не подставляется', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_ONE), '/'),
      async () => ({
        status: 'active',
        organizationId: ORG_ONE,
        clinicSlug: CLINIC_ONE,
        effectivePatientBrandOrganizationId: ORG_TWO,
        effectivePatientBrand: {
          effectiveDisplayName: 'Чужая клиника',
          patientAppName: 'Чужая клиника',
          accentToken: '#111111',
        },
      }),
    );
    expect(response.status).toBe(404);
  });

  it('клиника без купленного бренда получает живой корень с визиткой, а не 404', async () => {
    const runtime = await loadRuntime();
    const response = await runtime.proxy(
      requestFor(brandedHost(CLINIC_TWO), '/'),
      async () => ({
        status: 'active',
        organizationId: ORG_TWO,
        clinicSlug: CLINIC_TWO,
        effectivePatientBrandOrganizationId: ORG_TWO,
        effectivePatientBrand: {
          effectiveDisplayName: 'Санаторий Берег',
          patientAppName: 'Санаторий Берег',
          accentToken: '#2f6f4f',
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(routedPath(response, '/')).toBe(`/${CLINIC_TWO}`);
    expect(
      runtime.readResolvedSurface({
        get: (name) => response.headers.get(`x-middleware-request-${name}`),
      }),
    ).toMatchObject({ surface: 'patient_branded', clinicSlug: CLINIC_TWO });
  });
});
