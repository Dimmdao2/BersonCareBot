import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '@/proxy';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import type { AppSession, UserRole } from '@/shared/types/session';
import { STAFF_SURFACE } from '@/config/productSurfaces';
import {
  RESOLVED_SURFACE_HEADER,
  readResolvedSurface,
  type TenantSurfaceLookup,
} from '@/shared/lib/surface/requestSurface';

const STAFF_ORIGIN = new URL(STAFF_SURFACE.origin);

const PLATFORM_SURFACE_CONFIGURATIONS = [
  {
    name: 'one shared origin',
    staffOrigin: 'https://staff.example.test',
    patientOrigin: 'https://staff.example.test',
  },
  {
    name: 'distinct staff and patient origins',
    staffOrigin: 'https://staff.example.test',
    patientOrigin: 'https://patient.example.test',
  },
] as const;

type PlatformSurfaceConfiguration = (typeof PLATFORM_SURFACE_CONFIGURATIONS)[number];
type ProxyRuntime = Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>;

const BRANDED_ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';

function activeTenantSurface(organizationId = BRANDED_ORGANIZATION_ID): TenantSurfaceLookup {
  const effectivePatientBrand =
    organizationId === BRANDED_ORGANIZATION_ID
      ? {
          effectiveDisplayName: 'Clinic A Plus',
          patientAppName: 'Clinic A Care',
          accentToken: '#7a3cc2',
        }
      : {
          effectiveDisplayName: 'Clinic B Plus',
          patientAppName: 'Clinic B Care',
          accentToken: '#166534',
        };

  return async () => ({
    status: 'active',
    organizationId,
    effectivePatientBrandOrganizationId: organizationId,
    effectivePatientBrand,
  });
}

type HostMatrixCase = Readonly<{
  name: string;
  surface: 'staff' | 'platform_admin' | 'patient_default' | 'patient_branded';
  originFor: (runtime: ProxyRuntime) => URL;
  foreignOriginFor: (runtime: ProxyRuntime) => URL;
  tenantLookup?: TenantSurfaceLookup;
}>;

const HOST_MATRIX: readonly HostMatrixCase[] = [
  {
    name: 'staff',
    surface: 'staff',
    originFor: (runtime) => runtime.staffOrigin,
    foreignOriginFor: (runtime) => runtime.patientOrigin,
  },
  {
    name: 'platform admin',
    surface: 'platform_admin',
    originFor: (runtime) => new URL(`https://admin.${runtime.staffOrigin.hostname}`),
    foreignOriginFor: (runtime) => runtime.patientOrigin,
  },
  {
    name: 'patient default',
    surface: 'patient_default',
    originFor: (runtime) => runtime.patientOrigin,
    foreignOriginFor: (runtime) => runtime.staffOrigin,
  },
  {
    name: 'patient branded',
    surface: 'patient_branded',
    originFor: (runtime) => new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`),
    foreignOriginFor: (runtime) => runtime.staffOrigin,
    tenantLookup: activeTenantSurface(),
  },
];

async function loadProxyForSurfaceConfiguration({
  staffOrigin,
  patientOrigin,
}: PlatformSurfaceConfiguration) {
  vi.resetModules();
  vi.stubEnv('APP_BASE_URL', staffOrigin);
  vi.stubEnv('PATIENT_APP_ORIGIN', patientOrigin);

  const [proxyModule, productSurfaces, requestSurface] = await Promise.all([
    import('@/proxy'),
    import('@/config/productSurfaces'),
    import('@/shared/lib/surface/requestSurface'),
  ]);

  return {
    proxy: proxyModule.proxy,
    staffOrigin: new URL(productSurfaces.STAFF_SURFACE.origin),
    patientOrigin: new URL(productSurfaces.PATIENT_DEFAULT_SURFACE.origin),
    readResolvedSurface: requestSurface.readResolvedSurface,
    resolvedSurfaceHeader: requestSurface.RESOLVED_SURFACE_HEADER,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function requestFor(
  origin: URL,
  pathname: string,
  options: { method?: string; role?: UserRole; headers?: Record<string, string> } = {},
): NextRequest {
  const headers: Record<string, string> = {
    host: origin.host,
    'x-forwarded-proto': origin.protocol.replace(':', ''),
    ...options.headers,
  };
  if (options.role) {
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: {
        userId: `test-${options.role}`,
        role: options.role,
        displayName: options.role,
        bindings: {},
      },
      issuedAt: now,
      expiresAt: now + 3600,
    };
    headers.cookie = `${SESSION_COOKIE_NAME}=${encodeSessionCookie(session)}`;
  }
  return new NextRequest(new URL(pathname, origin), {
    method: options.method,
    headers,
  });
}

function middlewareRequestSurface(response: Response) {
  return readResolvedSurface({
    get(name: string) {
      return response.headers.get(`x-middleware-request-${name}`);
    },
  });
}

describe('Next proxy matcher boundary', () => {
  it.each([
    '/',
    '/clinic-a',
    '/legal/terms',
    '/book/clinic-a',
    '/book/embed.js',
    '/join/invite-a',
    '/setup',
    '/app',
    '/app/patient/login',
    '/api/auth/logout',
    '/manifest.webmanifest',
    '/manifest-staff.webmanifest',
    '/sw.js',
  ])('makes proxy the request choke point for %s', (pathname) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: new URL(pathname, STAFF_ORIGIN).href,
      }),
    ).toBe(true);
  });

  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image?url=%2Fpwa-icon-192.png&w=256&q=75',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/pwa-icon-192.png',
    '/fonts/app.woff2',
  ])('keeps immutable/static request %s outside the resolver', (pathname) => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        url: new URL(pathname, STAFF_ORIGIN).href,
      }),
    ).toBe(false);
  });
});

describe('HTTP CSRF origin boundary', () => {
  it('rejects a cross-origin browser mutation with a non-cacheable 403 response', async () => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/api/account/security/password/change', {
        method: 'POST',
        headers: {
          origin: 'https://attacker.example',
          'sec-fetch-site': 'same-origin',
        },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'csrf_origin_forbidden',
    });
  });

  it.each([
    ['missing source headers', { 'sec-fetch-site': 'same-origin' }],
    [
      'an ambiguous Origin header',
      {
        origin: `${STAFF_ORIGIN.origin}, https://attacker.example`,
        'sec-fetch-site': 'same-origin',
      },
    ],
  ])('rejects %s on a normal browser mutation', async (_case, headers) => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/api/account/security/password/change', {
        method: 'POST',
        headers,
      }),
    );

    expect(response.status).toBe(403);
  });

  it('allows the canonical same-origin browser mutation', async () => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/api/account/security/password/change', {
        method: 'POST',
        headers: {
          origin: STAFF_ORIGIN.origin,
          'sec-fetch-site': 'same-origin',
        },
      }),
    );

    expect(response.status).not.toBe(403);
  });
});

describe('B6 host matrix — browser session and CSRF boundaries', () => {
  const sourceCases = [
    {
      name: 'a foreign Origin',
      headersFor: (foreignOrigin: URL) => ({
        origin: foreignOrigin.origin,
        'sec-fetch-site': 'same-origin',
      }),
    },
    {
      name: 'a foreign Referer',
      headersFor: (foreignOrigin: URL) => ({
        referer: new URL('/app', foreignOrigin).href,
        'sec-fetch-site': 'same-origin',
      }),
    },
    {
      name: 'no Origin or Referer',
      headersFor: () => ({ 'sec-fetch-site': 'same-origin' }),
    },
  ] as const;

  for (const hostCase of HOST_MATRIX) {
    it.each(sourceCases)(
      `rejects $name on the ${hostCase.name} surface`,
      async ({ headersFor }) => {
        const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
        const response = await runtime.proxy(
          requestFor(hostCase.originFor(runtime), '/api/account/security/password/change', {
            method: 'POST',
            headers: headersFor(hostCase.foreignOriginFor(runtime)),
          }),
          hostCase.tenantLookup,
        );

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({
          ok: false,
          error: 'csrf_origin_forbidden',
        });
      },
    );
  }

  it('does not issue or fall back to a platform session for an unknown Host', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const response = await runtime.proxy(
      requestFor(new URL('https://untrusted.example'), '/app', { role: 'client' }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(
      runtime.readResolvedSurface({
        get: (name) => response.headers.get(`x-middleware-request-${name}`),
      }),
    ).toBeNull();
  });

  it('fails closed when a branded Host resolves organization A with organization B resources', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const response = await runtime.proxy(
      requestFor(new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`), '/app/patient/login'),
      async () => {
        const resolved = await activeTenantSurface(OTHER_ORGANIZATION_ID)('clinic-a');
        return { ...resolved, organizationId: BRANDED_ORGANIZATION_ID };
      },
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      runtime.readResolvedSurface({
        get: (name) => response.headers.get(`x-middleware-request-${name}`),
      }),
    ).toBeNull();
  });
});

describe('role-specific protected app doors', () => {
  it.each([
    [
      '/app/doctor/patients?tab=active',
      '/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients%3Ftab%3Dactive',
    ],
    ['/app/admin/system-health', '/app/admin/login?next=%2Fapp%2Fadmin%2Fsystem-health'],
  ])('keeps %s on its matching login door with next=', async (path, expectedPath) => {
    const response = await proxy(requestFor(STAFF_ORIGIN, path));
    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(`${new URL(location!).pathname}${new URL(location!).search}`).toBe(expectedPath);
  });

  it('redirects an unauthenticated patient from the shared-origin portal', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[0]);
    const response = await runtime.proxy(requestFor(runtime.staffOrigin, '/app/patient/profile'));
    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(`${new URL(location!).pathname}${new URL(location!).search}`).toBe(
      '/app/patient/login?next=%2Fapp%2Fpatient%2Fprofile',
    );
  });

  it('does not redirect a role login route', async () => {
    expect(
      (
        await proxy(
          requestFor(STAFF_ORIGIN, '/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients'),
        )
      ).headers.get('location'),
    ).toBeNull();
  });

  it('does not interrupt an authenticated doctor at their portal', async () => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/app/doctor/patients', { role: 'doctor' }),
    );
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('request-surface host matrix at the proxy choke point', () => {
  it.each([
    ['/app/patient/login', 200],
    ['/book', 200],
    ['/manifest.webmanifest', 200],
  ] as const)('keeps the patient route %s reachable on one shared origin', async (pathname, status) => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[0]);

    const response = await runtime.proxy(requestFor(runtime.staffOrigin, pathname));

    expect(response.status).toBe(status);
    expect(runtime.readResolvedSurface({ get: (name) => response.headers.get(`x-middleware-request-${name}`) }))
      .toMatchObject({
        surface: 'staff',
        publicOrigin: runtime.staffOrigin.origin,
      });
  });

  it.each([
    ['/app/patient/login', 'staff host'],
    ['/book', 'staff host'],
    ['/manifest.webmanifest', 'staff host'],
    ['/app/doctor/login', 'patient host'],
  ] as const)('hard-404s %s on the wrong %s when origins are distinct', async (pathname, wrongHost) => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const origin = wrongHost === 'staff host' ? runtime.staffOrigin : runtime.patientOrigin;

    const response = await runtime.proxy(requestFor(origin, pathname));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(runtime.readResolvedSurface({ get: (name) => response.headers.get(`x-middleware-request-${name}`) }))
      .toBeNull();
  });

  it.each([
    ['staff', (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) => runtime.staffOrigin, '/', 'staff'],
    ['patient default', (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) => runtime.patientOrigin, '/app/patient/login', 'patient_default'],
    ['platform admin', (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) => new URL(`https://admin.${runtime.staffOrigin.hostname}`), '/app/doctor/login', 'platform_admin'],
  ] as const)('resolves %s through the proxy choke point', async (_name, originFor, pathname, surface) => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);

    const response = await runtime.proxy(requestFor(originFor(runtime), pathname));

    expect(response.status).toBe(200);
    expect(runtime.readResolvedSurface({ get: (name) => response.headers.get(`x-middleware-request-${name}`) }))
      .toMatchObject({ surface });
  });
});

describe('global admin reaching platform pages under the doctor portal prefix', () => {
  it.each(['/app/doctor/analytics', '/app/doctor/booking-merge'])(
    'lets a platform-operations admin through to %s',
    async (path) => {
      const response = await proxy(requestFor(STAFF_ORIGIN, path, { role: 'admin' }));
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('still denies a platform-operations admin on a clinical-only doctor page', async () => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/app/doctor/patients', { role: 'admin' }),
    );
    const location = response.headers.get('location');
    expect(location).not.toBeNull();
    expect(`${new URL(location!).pathname}${new URL(location!).search}`).toBe(
      '/app/admin/system-health?app_access_denied=1',
    );
  });
});

describe('resolved surface request choke point', () => {
  it('preserves the real URL for independent patient routing-security gates', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const response = await runtime.proxy(
      requestFor(runtime.patientOrigin, '/app/patient/login?next=%2Fapp%2Fpatient%2Fprofile', {
        headers: {
          'x-bc-pathname': '/app/patient/onboarding',
          'x-bc-search': '?spoofed=1',
        },
      }),
    );

    expect(response.headers.get('x-middleware-request-x-bc-pathname')).toBe(
      '/app/patient/login',
    );
    expect(response.headers.get('x-middleware-request-x-bc-search')).toBe(
      '?next=%2Fapp%2Fpatient%2Fprofile',
    );
  });

  it.each(PLATFORM_SURFACE_CONFIGURATIONS)(
    'stamps the resolved surface once for /app with $name',
    async (surfaceConfiguration) => {
      const runtime = await loadProxyForSurfaceConfiguration(surfaceConfiguration);
      const origin = runtime.patientOrigin;
      const incomingSpoof = encodeURIComponent(
        JSON.stringify({
          surface: 'patient_branded',
          publicOrigin: 'https://attacker.example',
          authPolicy: 'patient',
        }),
      );
      const response = await runtime.proxy(
        requestFor(origin, '/app', {
          headers: { [runtime.resolvedSurfaceHeader]: incomingSpoof },
        }),
      );

      expect(
        runtime.readResolvedSurface({
          get: (name) => response.headers.get(`x-middleware-request-${name}`),
        }),
      )
        .toMatchObject({
          surface:
            surfaceConfiguration.staffOrigin === surfaceConfiguration.patientOrigin
              ? 'staff'
              : 'patient_default',
          publicOrigin: origin.origin,
        });
    },
  );

  it('passes the B1/B4 tenant seam result without resolving organization data itself', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const seenHostnames: string[] = [];
    const tenantLookup: TenantSurfaceLookup = async (hostname) => {
      seenHostnames.push(hostname);
      const safeBrandWithInternalExtras = {
        effectiveDisplayName: 'Clinic A Plus',
        patientAppName: 'Clinic A Care',
        accentToken: '#7A3CC2',
        core: { displayName: 'must not cross the anonymous boundary', isActive: true },
        resolution: 'applied',
      };
      return {
        status: 'active',
        organizationId,
        effectivePatientBrandOrganizationId: organizationId,
        effectivePatientBrand: safeBrandWithInternalExtras,
      };
    };
    const brandedOrigin = new URL('https://clinic-a.therapygo.ru:8443');
    const response = await proxy(requestFor(brandedOrigin, '/app/patient/login'), tenantLookup);

    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      publicOrigin: brandedOrigin.origin,
      organizationId,
      authPolicy: 'patient',
      effectivePatientBrand: {
        effectiveDisplayName: 'Clinic A Plus',
        patientAppName: 'Clinic A Care',
        accentToken: '#7a3cc2',
      },
    });
    expect(middlewareRequestSurface(response)?.effectivePatientBrand).toEqual({
      effectiveDisplayName: 'Clinic A Plus',
      patientAppName: 'Clinic A Care',
      accentToken: '#7a3cc2',
    });
    expect(seenHostnames).toEqual(['clinic-a.therapygo.ru']);
  });

  it.each([
    ['an invalid accent token', '#123456; background:url(https://attacker.example)'],
    ['a missing patient app name', ''],
  ] as const)(
    'returns hard 404 when an active tenant seam supplies %s instead of a safe brand',
    async (_case, invalidValue) => {
      const organizationId = '11111111-1111-4111-8111-111111111111';
      const response = await proxy(
        requestFor(new URL('https://clinic-a.therapygo.ru'), '/app/patient/login'),
        async () => ({
          status: 'active' as const,
          organizationId,
          effectivePatientBrandOrganizationId: organizationId,
          effectivePatientBrand: {
            effectiveDisplayName: 'Clinic A Plus',
            patientAppName: invalidValue === '' ? invalidValue : 'Clinic A Care',
            accentToken: invalidValue === '' ? '#7a3cc2' : invalidValue,
          },
        }),
      );

      expect(response.status).toBe(404);
      expect(middlewareRequestSurface(response)).toBeNull();
    },
  );

  it('returns hard 404 for an unknown Host without platform fallback', async () => {
    const response = await proxy(requestFor(new URL('https://untrusted.example'), '/app'));
    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it.each(['duplicate', 'inactive'] as const)(
    'returns hard 404 for a %s tenant Host without platform fallback',
    async (status) => {
      const response = await proxy(
        requestFor(new URL('https://untrusted.example'), '/app'),
        async () => ({ status }),
      );
      expect(response.status).toBe(404);
      expect(middlewareRequestSurface(response)).toBeNull();
    },
  );
});
