import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from '@/proxy';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import type { AppSession, UserRole } from '@/shared/types/session';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  RESOLVED_SURFACE_HEADER,
  readResolvedSurface,
  type TenantSurfaceLookup,
} from '@/shared/lib/surface/requestSurface';

const STAFF_ORIGIN = new URL(STAFF_SURFACE.origin);
const PATIENT_ORIGIN = new URL(PATIENT_DEFAULT_SURFACE.origin);

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

  it('keeps the patient portal on the patient Host', async () => {
    const response = await proxy(requestFor(PATIENT_ORIGIN, '/app/patient/profile'));
    expect(response.headers.get('location')).toBe(
      `${PATIENT_ORIGIN.origin}/app/patient/login?next=%2Fapp%2Fpatient%2Fprofile`,
    );
  });

  it('does not redirect a role login route or public booking route', async () => {
    expect(
      (
        await proxy(
          requestFor(STAFF_ORIGIN, '/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients'),
        )
      ).headers.get('location'),
    ).toBeNull();
    expect(
      (await proxy(requestFor(PATIENT_ORIGIN, '/book/clinic-a'))).headers.get('location'),
    ).toBeNull();
  });

  it.each(['/app/patient/profile', '/book', '/manifest.webmanifest'])(
    'hard-404s patient route %s on the staff Host when surface Hosts are distinct',
    async (pathname) => {
      const response = await proxy(requestFor(STAFF_ORIGIN, pathname, { role: 'doctor' }));
      expect(response.status).toBe(404);
      expect(response.headers.get('location')).toBeNull();
    },
  );

  it('keeps both route trees and health reachable when staff and patient share one Host', async () => {
    const patientOriginDescriptor = Object.getOwnPropertyDescriptor(
      PATIENT_DEFAULT_SURFACE,
      'origin',
    );
    if (!patientOriginDescriptor) throw new Error('patient_surface_origin_descriptor_missing');
    Object.defineProperty(PATIENT_DEFAULT_SURFACE, 'origin', {
      ...patientOriginDescriptor,
      value: STAFF_SURFACE.origin,
    });

    try {
      const expectedStatuses = [
        ['/app/patient/login', 200],
        ['/app/patient/cabinet', 307],
        ['/book', 200],
        ['/join/start', 200],
        ['/clinic-a', 200],
        ['/manifest.webmanifest', 200],
        ['/api/health', 200],
      ] as const;

      for (const [pathname, expectedStatus] of expectedStatuses) {
        const response = await proxy(requestFor(STAFF_ORIGIN, pathname));
        expect(response.status, pathname).toBe(expectedStatus);
        if (expectedStatus === 200) {
          expect(middlewareRequestSurface(response), pathname).toMatchObject({
            surface: 'staff',
            publicOrigin: STAFF_ORIGIN.origin,
          });
        }
      }
    } finally {
      Object.defineProperty(PATIENT_DEFAULT_SURFACE, 'origin', patientOriginDescriptor);
    }
  });

  it('does not interrupt an authenticated doctor at their portal', async () => {
    const response = await proxy(
      requestFor(STAFF_ORIGIN, '/app/doctor/patients', { role: 'doctor' }),
    );
    expect(response.headers.get('location')).toBeNull();
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
    const response = await proxy(
      requestFor(PATIENT_ORIGIN, '/app/patient/login?next=%2Fapp%2Fpatient%2Fprofile', {
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

  it.each([
    [STAFF_ORIGIN, '/', 'staff'],
    [PATIENT_ORIGIN, '/app', 'patient_default'],
  ] as const)('stamps %s once for %s', async (origin, path, expectedSurface) => {
    const incomingSpoof = encodeURIComponent(
      JSON.stringify({
        surface: 'patient_branded',
        publicOrigin: 'https://attacker.example',
        authPolicy: 'patient',
      }),
    );
    const response = await proxy(
      requestFor(origin, path, { headers: { [RESOLVED_SURFACE_HEADER]: incomingSpoof } }),
    );

    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: expectedSurface,
      publicOrigin: origin.origin,
    });
  });

  it('passes the B1/B4 tenant seam result without resolving organization data itself', async () => {
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const seenHostnames: string[] = [];
    const tenantLookup: TenantSurfaceLookup = async (hostname) => {
      seenHostnames.push(hostname);
      return {
        status: 'active',
        organizationId,
        effectivePatientBrand: {
          organizationId,
          core: { displayName: 'Clinic A', isActive: true },
          paid: { displayName: 'Clinic A Plus', logoUrl: null },
          effectiveDisplayName: 'Clinic A Plus',
          resolution: 'applied',
        },
      };
    };
    const brandedOrigin = new URL('https://clinic-a.therapygo.ru:8443');
    const response = await proxy(
      requestFor(brandedOrigin, '/app/patient/login'),
      tenantLookup,
    );

    expect(middlewareRequestSurface(response)).toMatchObject({
      surface: 'patient_branded',
      publicOrigin: brandedOrigin.origin,
      organizationId,
      authPolicy: 'patient',
      effectivePatientBrand: { effectiveDisplayName: 'Clinic A Plus' },
    });
    expect(seenHostnames).toEqual(['clinic-a.therapygo.ru']);
  });

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
