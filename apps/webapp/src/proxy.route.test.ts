import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '@/proxy';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import type { AppSession, UserRole } from '@/shared/types/session';
import { STAFF_SURFACE } from '@/config/productSurfaces';
import {
  DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
  RESOLVED_SURFACE_HEADER,
  readResolvedSurface,
  type SurfaceAuthPolicyConfig,
  type TenantSurfaceLookup,
} from '@/shared/lib/surface/requestSurface';
import {
  createOrgBrandingService,
  DEFAULT_PATIENT_ACCENT_TOKEN,
} from '@/modules/org-branding/service';
import type { OrgBrandRevision, OrgBrandingPort } from '@/modules/org-branding/ports';
import type { MechanicAccessState } from '@/modules/org-entitlements/types';
import { resolvePatientSubdomainOrganization } from '@/modules/clinic-directory/patientSubdomainOrganization';

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
    clinicSlug: organizationId === BRANDED_ORGANIZATION_ID ? 'clinic-a' : 'clinic-b',
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
    resolveRequestSurface: requestSurface.resolveRequestSurface,
    resolvedSurfaceHeader: requestSurface.RESOLVED_SURFACE_HEADER,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('surface auth policy', () => {
  it('matches the 2026-08-17 live runtime-settings snapshot on all three surfaces', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const resolve = (origin: URL) =>
      runtime.resolveRequestSurface({
        host: origin.host,
        protocol: origin.protocol,
        resolveTenantSurface: async () => ({ status: 'unknown' }),
      });

    const [staff, platformAdmin, patient] = await Promise.all([
      resolve(runtime.staffOrigin),
      resolve(new URL(`https://admin.${runtime.staffOrigin.hostname}`)),
      resolve(runtime.patientOrigin),
    ]);

    expect(staff?.authPolicy).toEqual({
      availableMethods: ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'],
      enabledMethods: ['password', 'email_code', 'totp', 'passkey'],
    });
    expect(platformAdmin?.authPolicy).toEqual({
      availableMethods: ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'],
      enabledMethods: ['password', 'email_code', 'totp', 'passkey'],
    });
    expect(patient?.authPolicy).toEqual({
      availableMethods: ['email_code', 'phone_bot', 'oauth', 'passkey'],
      enabledMethods: ['email_code', 'passkey'],
    });
  });

  it('enables OAuth and passkey by policy setting without changing the resolver or method type', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const disabledConfig: SurfaceAuthPolicyConfig = {
      ...DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
      staff: {
        ...DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff,
        enabledMethods: ['password', 'email_code', 'phone_bot', 'totp'],
      },
    };
    const enabledConfig: SurfaceAuthPolicyConfig = {
      ...disabledConfig,
      staff: {
        ...disabledConfig.staff,
        enabledMethods: [...disabledConfig.staff.enabledMethods, 'oauth', 'passkey'],
      },
    };
    const resolveWith = (authPolicyConfig: SurfaceAuthPolicyConfig) =>
      runtime.resolveRequestSurface({
        host: runtime.staffOrigin.host,
        protocol: runtime.staffOrigin.protocol,
        resolveTenantSurface: async () => ({ status: 'unknown' }),
        authPolicyConfig,
      });

    await expect(resolveWith(disabledConfig)).resolves.toMatchObject({
      authPolicy: { enabledMethods: ['password', 'email_code', 'phone_bot', 'totp'] },
    });
    await expect(resolveWith(enabledConfig)).resolves.toMatchObject({
      authPolicy: {
        enabledMethods: ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'],
      },
    });
  });

  // Self-tests for the two policy gates this surface introduced: break the input on purpose and
  // make sure the resolver notices (AGENTS.md §10a).
  it('refuses a surface whose enabled methods escape its available methods', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const escapedConfig = {
      ...DEFAULT_SURFACE_AUTH_POLICY_CONFIG,
      staff: {
        availableMethods: ['password', 'email_code'],
        enabledMethods: ['password', 'oauth'],
      },
    } as unknown as SurfaceAuthPolicyConfig;

    await expect(
      runtime.resolveRequestSurface({
        host: runtime.staffOrigin.host,
        protocol: runtime.staffOrigin.protocol,
        resolveTenantSurface: async () => ({ status: 'unknown' }),
        authPolicyConfig: escapedConfig,
      }),
    ).resolves.toBeNull();
  });

  it('rejects a resolved-surface header whose auth policy is invalid', () => {
    const headerFor = (authPolicy: unknown) => {
      const encoded = encodeURIComponent(
        JSON.stringify({ surface: 'staff', publicOrigin: STAFF_ORIGIN.origin, authPolicy }),
      );
      return readResolvedSurface({ get: () => encoded });
    };

    expect(headerFor(DEFAULT_SURFACE_AUTH_POLICY_CONFIG.staff)).not.toBeNull();
    expect(headerFor({ availableMethods: ['email_code'], enabledMethods: ['oauth'] })).toBeNull();
    expect(
      headerFor({ availableMethods: ['email_code', 'quantum'], enabledMethods: ['email_code'] }),
    ).toBeNull();
    expect(headerFor({ availableMethods: ['email_code', 'email_code'], enabledMethods: [] })).toBeNull();
    expect(headerFor('password,email_code')).toBeNull();
  });
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

function middlewareRoutedPath(response: Response, requestedPath: string): string {
  const rewrite = response.headers.get('x-middleware-rewrite');
  return rewrite ? new URL(rewrite).pathname : requestedPath;
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
      requestFor(
        new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`),
        '/app/patient/login',
      ),
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
        await proxy(requestFor(STAFF_ORIGIN, '/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients'))
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
  ] as const)(
    'keeps the patient route %s reachable on one shared origin',
    async (pathname, status) => {
      const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[0]);

      const response = await runtime.proxy(requestFor(runtime.staffOrigin, pathname));

      expect(response.status).toBe(status);
      expect(
        runtime.readResolvedSurface({
          get: (name) => response.headers.get(`x-middleware-request-${name}`),
        }),
      ).toMatchObject({
        surface: 'staff',
        publicOrigin: runtime.staffOrigin.origin,
      });
    },
  );

  it.each([
    ['/app/patient/login', 'staff host'],
    ['/book', 'staff host'],
    ['/manifest.webmanifest', 'staff host'],
    ['/app/doctor/login', 'patient host'],
  ] as const)(
    'hard-404s %s on the wrong %s when origins are distinct',
    async (pathname, wrongHost) => {
      const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
      const origin = wrongHost === 'staff host' ? runtime.staffOrigin : runtime.patientOrigin;

      const response = await runtime.proxy(requestFor(origin, pathname));

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(
        runtime.readResolvedSurface({
          get: (name) => response.headers.get(`x-middleware-request-${name}`),
        }),
      ).toBeNull();
    },
  );

  it.each([
    [
      'staff',
      (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) =>
        runtime.staffOrigin,
      '/',
      'staff',
    ],
    [
      'patient default',
      (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) =>
        runtime.patientOrigin,
      '/app/patient/login',
      'patient_default',
    ],
    [
      'platform admin',
      (runtime: Awaited<ReturnType<typeof loadProxyForSurfaceConfiguration>>) =>
        new URL(`https://admin.${runtime.staffOrigin.hostname}`),
      '/app/doctor/login',
      'platform_admin',
    ],
  ] as const)(
    'resolves %s through the proxy choke point',
    async (_name, originFor, pathname, surface) => {
      const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);

      const response = await runtime.proxy(requestFor(originFor(runtime), pathname));

      expect(response.status).toBe(200);
      expect(
        runtime.readResolvedSurface({
          get: (name) => response.headers.get(`x-middleware-request-${name}`),
        }),
      ).toMatchObject({ surface });
    },
  );
});

describe('B5: one patient tree with resolved context', () => {
  const routes = [
    {
      name: 'root',
      patientDefaultPath: '/',
      patientDefaultTarget: '/app',
      patientBrandedPath: '/',
      patientBrandedTarget: '/clinic-a',
    },
    {
      name: 'login',
      patientDefaultPath: '/app/patient/login',
      patientDefaultTarget: '/app/patient/login',
      patientBrandedPath: '/app/patient/login',
      patientBrandedTarget: '/app/patient/login',
    },
    {
      // Password recovery is a state of the shared login UI; this is its public HTTP boundary.
      name: 'recovery',
      patientDefaultPath: '/api/auth/email-password/forgot',
      patientDefaultTarget: '/api/auth/email-password/forgot',
      patientBrandedPath: '/api/auth/email-password/forgot',
      patientBrandedTarget: '/api/auth/email-password/forgot',
    },
    {
      name: 'clinic card',
      patientDefaultPath: '/clinic-a',
      patientDefaultTarget: '/clinic-a',
      patientBrandedPath: '/clinic-a',
      patientBrandedTarget: '/clinic-a',
    },
    {
      name: 'booking',
      patientDefaultPath: '/clinic-a/booking',
      patientDefaultTarget: '/clinic-a/booking',
      patientBrandedPath: '/booking',
      patientBrandedTarget: '/clinic-a/booking',
    },
    {
      name: 'patient cabinet',
      patientDefaultPath: '/app/patient/cabinet',
      patientDefaultTarget: '/app/patient/cabinet',
      patientBrandedPath: '/app/patient/cabinet',
      patientBrandedTarget: '/app/patient/cabinet',
    },
  ] as const;

  it.each(routes)('serves $name from the same route tree on both patient surfaces', async (route) => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const brandedOrigin = new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`);
    const [patientDefault, patientBranded] = await Promise.all([
      runtime.proxy(
        requestFor(runtime.patientOrigin, route.patientDefaultPath, { role: 'client' }),
      ),
      runtime.proxy(
        requestFor(brandedOrigin, route.patientBrandedPath, { role: 'client' }),
        activeTenantSurface(),
      ),
    ]);

    expect(patientDefault.status).toBe(200);
    expect(patientBranded.status).toBe(200);
    expect(middlewareRoutedPath(patientDefault, route.patientDefaultPath)).toBe(
      route.patientDefaultTarget,
    );
    expect(middlewareRoutedPath(patientBranded, route.patientBrandedPath)).toBe(
      route.patientBrandedTarget,
    );
    expect(
      runtime.readResolvedSurface({
        get: (name) => patientDefault.headers.get(`x-middleware-request-${name}`),
      }),
    ).toMatchObject({ surface: 'patient_default' });
    expect(
      runtime.readResolvedSurface({
        get: (name) => patientBranded.headers.get(`x-middleware-request-${name}`),
      }),
    ).toMatchObject({ surface: 'patient_branded', clinicSlug: 'clinic-a' });
  });

  it('rewrites branded root to the exact existing app/[clinicSlug] clinic-card route', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const brandedOrigin = new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`);
    const [root, canonicalCard] = await Promise.all([
      runtime.proxy(requestFor(brandedOrigin, '/'), activeTenantSurface()),
      runtime.proxy(requestFor(brandedOrigin, '/clinic-a'), activeTenantSurface()),
    ]);

    expect(middlewareRoutedPath(root, '/')).toBe('/clinic-a');
    expect(canonicalCard.headers.get('x-middleware-rewrite')).toBeNull();
    expect(middlewareRequestSurface(root)).toEqual(middlewareRequestSurface(canonicalCard));
  });

  it('keeps Therapysto home and its specialist directory unreachable on patient origins', async () => {
    const runtime = await loadProxyForSurfaceConfiguration(PLATFORM_SURFACE_CONFIGURATIONS[1]);
    const brandedOrigin = new URL(`https://clinic-a.${runtime.patientOrigin.hostname}`);
    const [defaultRoot, brandedRoot, defaultDirectory, brandedDirectory] = await Promise.all([
      runtime.proxy(requestFor(runtime.patientOrigin, '/')),
      runtime.proxy(requestFor(brandedOrigin, '/'), activeTenantSurface()),
      runtime.proxy(requestFor(runtime.patientOrigin, '/specialists')),
      runtime.proxy(requestFor(brandedOrigin, '/specialists'), activeTenantSurface()),
    ]);

    expect(middlewareRoutedPath(defaultRoot, '/')).toBe('/app');
    expect(middlewareRoutedPath(brandedRoot, '/')).toBe('/clinic-a');
    for (const response of [defaultDirectory, brandedDirectory]) {
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
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

    expect(response.headers.get('x-middleware-request-x-bc-pathname')).toBe('/app/patient/login');
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
          authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
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
      ).toMatchObject({
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
        clinicSlug: 'clinic-a',
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
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
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

  it('keeps an active clinic without paid branding on its live core-name surface', async () => {
    const organizationId = '33333333-3333-4333-8333-333333333333';
    const response = await proxy(
      requestFor(new URL('https://clinic-without-branding.therapygo.ru'), '/app/patient/login'),
      async () => ({
        status: 'active' as const,
        organizationId,
        clinicSlug: 'clinic-without-branding',
        effectivePatientBrandOrganizationId: organizationId,
        effectivePatientBrand: {
          effectiveDisplayName: 'Клиника без брендинга',
          patientAppName: 'Клиника без брендинга',
          accentToken: '#284da0',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      organizationId,
      effectivePatientBrand: {
        effectiveDisplayName: 'Клиника без брендинга',
        patientAppName: 'Клиника без брендинга',
        accentToken: '#284da0',
      },
    });
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
          clinicSlug: 'clinic-a',
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

/**
 * Независимый аудит `B4a` (23.08.2026). Оракул — `IMPLEMENTATION_PLAN.md` §1.2b-1 и пункт `B4a`:
 * «известная активная метка → поверхность резолвится с `core.displayName` и брендом платформы;
 * `404` остаётся только для неизвестной метки, неактивной и удалённой организации».
 *
 * Отдельные проверки `B4`-проекции и `B3`-резолвера кормят друг друга РУЧНЫМИ значениями, поэтому ни
 * одна из них не видит рассогласования контрактов на стыке. Здесь стык собран из настоящих кусков:
 * реальный `resolvePatientSubdomainOrganization` (B1) → реальный `createOrgBrandingService`
 * (B4, audience `anonymous`) → реальный `proxy`/`resolveRequestSurface` (B3). Заглушены только
 * порт БД и резолвер тарифа, то есть внешние границы.
 */
describe('B4a: адрес клиники на нашем поддомене живёт без купленного брендинга', () => {
  const UNBRANDED_ORGANIZATION_ID = '77777777-7777-4777-8777-777777777777';
  const PAID_ORGANIZATION_ID = '88888888-8888-4888-8888-888888888888';
  const CLOSED_ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';
  const PAID_LOGO_MEDIA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  type Tenant = {
    organizationId: string;
    title: string;
    isActive: boolean;
    accessState: MechanicAccessState;
    published: OrgBrandRevision | null;
  };

  const paidRevision: OrgBrandRevision = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    organizationId: PAID_ORGANIZATION_ID,
    status: 'published',
    displayName: 'Кедр Premium',
    patientAppName: 'Кедр для пациента',
    accentToken: '#0F766E',
    logoMediaId: PAID_LOGO_MEDIA_ID,
    logoMediaReady: true,
    createdByPlatformUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    publishedByPlatformUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    archivedByPlatformUserId: null,
    publishedAt: '2026-08-20T00:00:00.000Z',
    archivedAt: null,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };

  const TENANTS: Readonly<Record<string, Tenant>> = {
    // Активная клиника, брендинг не покупала: тариф выключил механику.
    sosny: {
      organizationId: UNBRANDED_ORGANIZATION_ID,
      title: 'Реабилитационный центр «Сосны»',
      isActive: true,
      accessState: 'disabled',
      published: null,
    },
    // Активная клиника с тарифом, но ещё ничего не опубликовала.
    berezy: {
      organizationId: UNBRANDED_ORGANIZATION_ID,
      title: 'Клиника «Берёзы»',
      isActive: true,
      accessState: 'full_access',
      published: null,
    },
    // Купленный и опубликованный бренд — фолбэк `B4` обязан проиграть ему.
    kedr: {
      organizationId: PAID_ORGANIZATION_ID,
      title: 'Кедр core',
      isActive: true,
      accessState: 'full_access',
      published: paidRevision,
    },
    // Неактивная организация: `404` по оракулу.
    zakryta: {
      organizationId: CLOSED_ORGANIZATION_ID,
      title: 'Закрытая клиника',
      isActive: false,
      accessState: 'full_access',
      published: paidRevision,
    },
  };

  function brandingPortFor(tenant: Tenant | null): OrgBrandingPort {
    return {
      // `null` = строки организации нет (удалённая организация).
      getCoreContext: async () =>
        tenant
          ? {
              organizationId: tenant.organizationId,
              displayName: tenant.title,
              isActive: tenant.isActive,
            }
          : null,
      getPublishedRevision: async () => tenant?.published ?? null,
      getDraftRevision: async () => null,
      saveDraft: async () => paidRevision,
      publishDraft: async () => paidRevision,
      unpublish: async () => true,
    };
  }

  /** Тот самый стык, которого сегодня нет в продуктовом коде: B1 → B4 → результат для B3. */
  function tenantSeam(directory: Readonly<Record<string, Tenant>> = TENANTS): TenantSurfaceLookup {
    return async (hostname) => {
      const label = hostname.split('.')[0] ?? '';
      const resolution = await resolvePatientSubdomainOrganization(
        {
          resolveOrganizationIdBySlug: async (slug) => directory[slug]?.organizationId ?? null,
        },
        label,
      );
      if (resolution.kind !== 'resolved') return { status: 'unknown' };
      const tenant = directory[resolution.slug]!;
      const brand = await createOrgBrandingService({
        port: brandingPortFor(tenant),
        resolveBrandingAccess: async () => ({
          mechanic: 'branding',
          state: tenant.accessState,
          policySource: 'mechanic',
          warning: null,
        }),
      }).resolveEffectiveOrgBranding(resolution.organizationId, 'anonymous');
      if (!brand) return { status: 'inactive' };
      return {
        status: 'active',
        organizationId: resolution.organizationId,
        clinicSlug: resolution.slug,
        effectivePatientBrandOrganizationId: resolution.organizationId,
        effectivePatientBrand: brand,
      };
    };
  }

  function get(label: string, seam: TenantSurfaceLookup = tenantSeam()) {
    return proxy(requestFor(new URL(`https://${label}.therapygo.ru`), '/app/patient/login'), seam);
  }

  it.each([
    ['механика брендинга выключена тарифом', 'sosny', 'Реабилитационный центр «Сосны»'],
    ['тариф есть, но ничего не опубликовано', 'berezy', 'Клиника «Берёзы»'],
  ])('отдаёт живую поверхность с именем организации, когда %s', async (_case, label, title) => {
    const response = await get(label);

    expect(response.status).toBe(200);
    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      organizationId: UNBRANDED_ORGANIZATION_ID,
      authPolicy: DEFAULT_SURFACE_AUTH_POLICY_CONFIG.patient,
      effectivePatientBrand: {
        effectiveDisplayName: title,
        patientAppName: title,
        // Платформенное оформление, а не купленный акцент.
        accentToken: DEFAULT_PATIENT_ACCENT_TOKEN,
      },
    });
    // Плашки «на Therapygo» и любых платформенных диагностик в проекции нет.
    expect(middlewareRequestSurface(response)?.effectivePatientBrand).toEqual({
      effectiveDisplayName: title,
      patientAppName: title,
      accentToken: DEFAULT_PATIENT_ACCENT_TOKEN,
    });
  });

  it('оставляет купленный бренд победителем над фолбэком ядра', async () => {
    const response = await get('kedr');

    expect(response.status).toBe(200);
    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      organizationId: PAID_ORGANIZATION_ID,
      effectivePatientBrand: {
        effectiveDisplayName: 'Кедр Premium',
        patientAppName: 'Кедр для пациента',
        accentToken: '#0f766e',
        logoUrl: `/api/media/${PAID_LOGO_MEDIA_ID}`,
      },
    });
  });

  it('держит `404` для неизвестной метки', async () => {
    const response = await get('takoy-kliniki-net');

    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it('держит `404` для неактивной организации, даже с опубликованным брендом', async () => {
    const response = await get('zakryta');

    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it('держит `404` для удалённой организации: метки в каталоге больше нет', async () => {
    const withoutSosny = { ...TENANTS };
    delete (withoutSosny as Record<string, Tenant>).sosny;

    const response = await get('sosny', tenantSeam(withoutSosny));

    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it('не выдаёт поверхность, если организация исчезла между резолвом метки и чтением ядра', async () => {
    const seam: TenantSurfaceLookup = async () => {
      const brand = await createOrgBrandingService({
        port: brandingPortFor(null),
        resolveBrandingAccess: async () => ({
          mechanic: 'branding',
          state: 'full_access',
          policySource: 'mechanic',
          warning: null,
        }),
      })
        .resolveEffectiveOrgBranding(UNBRANDED_ORGANIZATION_ID, 'anonymous')
        .catch(() => null);
      return brand
        ? {
            status: 'active',
            organizationId: UNBRANDED_ORGANIZATION_ID,
            clinicSlug: 'sosny',
            effectivePatientBrandOrganizationId: UNBRANDED_ORGANIZATION_ID,
            effectivePatientBrand: brand,
          }
        : { status: 'unknown' };
    };

    const response = await get('sosny', seam);

    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it('не пускает бренд ЧУЖОЙ организации на брендированный хост', async () => {
    const crossTenant: TenantSurfaceLookup = async (hostname) => {
      const resolved = await tenantSeam()(hostname);
      if (resolved.status !== 'active') return resolved;
      return { ...resolved, organizationId: PAID_ORGANIZATION_ID };
    };

    const response = await get('sosny', crossTenant);

    expect(response.status).toBe(404);
    expect(middlewareRequestSurface(response)).toBeNull();
  });

  it.each([119, 120, 121, 199, 200])(
    'оставляет живой адрес клинике с названием из %i знаков',
    async (titleLength) => {
      const title = 'К'.repeat(titleLength);
      const response = await get('sosny', tenantSeam({
        ...TENANTS,
        sosny: { ...TENANTS.sosny!, title },
      }));

      expect(response.status).toBe(200);
      expect(middlewareRequestSurface(response)).toMatchObject({
        surface: 'patient_branded',
        effectivePatientBrand: {
          effectiveDisplayName: title.slice(0, 120),
          patientAppName: title.slice(0, 120),
        },
      });
    },
  );

  it('оставляет живой адрес, когда тариф есть и опубликована только палитра, а имя ядра длинное', async () => {
    // Ветка `applied` берёт имя ядра ДРУГОЙ строкой, чем платформенный фолбэк: без своего случая
    // возврат обхода нормализации здесь остаётся зелёным.
    const title = 'Ю'.repeat(200);
    const response = await get('kedr', tenantSeam({
      ...TENANTS,
      kedr: {
        ...TENANTS.kedr!,
        title,
        published: { ...paidRevision, displayName: null, patientAppName: null, logoMediaId: null },
      },
    }));

    expect(response.status).toBe(200);
    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      effectivePatientBrand: {
        effectiveDisplayName: title.slice(0, 120),
        patientAppName: title.slice(0, 120),
        accentToken: '#0f766e',
      },
    });
  });

  it('оставляет живой адрес клинике с эмодзи в названии: срез не рвёт поверхность', async () => {
    // 200 UTF-16 единиц: срез по 120 попадает в середину суррогатной пары.
    const title = '🌿'.repeat(100);
    const response = await get('sosny', tenantSeam({
      ...TENANTS,
      sosny: { ...TENANTS.sosny!, title },
    }));

    expect(response.status).toBe(200);
    expect(middlewareRequestSurface(response)?.surface).toBe('patient_branded');
  });
});
