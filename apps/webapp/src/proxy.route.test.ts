import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import type { AppSession, UserRole } from '@/shared/types/session';

function unsafeRequest(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`https://app.example.test${pathname}`, {
    method: 'POST',
    headers: {
      host: 'app.example.test',
      'x-forwarded-proto': 'https',
      ...headers,
    },
  });
}

function appRequest(pathname: string, role?: UserRole, adminMode?: boolean): NextRequest {
  const headers: Record<string, string> = { host: 'app.example.test' };
  if (role) {
    const now = Math.floor(Date.now() / 1000);
    const session: AppSession = {
      user: {
        userId: `test-${role}`,
        role,
        displayName: role,
        bindings: {},
      },
      issuedAt: now,
      expiresAt: now + 3600,
      ...(adminMode !== undefined ? { adminMode } : {}),
    };
    headers.cookie = `${SESSION_COOKIE_NAME}=${encodeSessionCookie(session)}`;
  }
  return new NextRequest(`https://app.example.test${pathname}`, { headers });
}

describe('HTTP CSRF origin boundary', () => {
  it('rejects a cross-origin browser mutation with a non-cacheable 403 response', async () => {
    const response = proxy(
      unsafeRequest('/api/account/security/password/change', {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'same-origin',
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
        origin: 'https://app.example.test, https://attacker.example',
        'sec-fetch-site': 'same-origin',
      },
    ],
  ])('rejects %s on a normal browser mutation', async (_case, headers) => {
    const response = proxy(unsafeRequest('/api/account/security/password/change', headers));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'csrf_origin_forbidden',
    });
  });

  it('allows the canonical same-origin browser mutation', () => {
    const response = proxy(
      unsafeRequest('/api/account/security/password/change', {
        origin: 'https://app.example.test',
        'sec-fetch-site': 'same-origin',
      }),
    );

    expect(response.status).not.toBe(403);
  });

  it('keeps the integrator exemption exact instead of exempting path prefixes', () => {
    const exemptResponse = proxy(unsafeRequest('/api/integrator/events'));
    const nearMatchResponse = proxy(unsafeRequest('/api/integrator/events/extra'));

    expect(exemptResponse.status).not.toBe(403);
    expect(nearMatchResponse.status).toBe(403);
  });
});

describe('role-specific protected app doors', () => {
  it.each([
    [
      '/app/doctor/patients?tab=active',
      '/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients%3Ftab%3Dactive',
    ],
    ['/app/patient/profile', '/app/patient/login?next=%2Fapp%2Fpatient%2Fprofile'],
    ['/app/admin/system-health', '/app/admin/login?next=%2Fapp%2Fadmin%2Fsystem-health'],
  ])('keeps %s on its matching login door with next=', (path, expectedPath) => {
    const response = proxy(appRequest(path));

    expect(response.headers.get('location')).toBe(`https://app.example.test${expectedPath}`);
  });

  it('does not redirect a role login route or a public booking route', () => {
    expect(
      proxy(appRequest('/app/doctor/login?next=%2Fapp%2Fdoctor%2Fpatients')).headers.get(
        'location',
      ),
    ).toBeNull();
    expect(proxy(appRequest('/book/clinic-a')).headers.get('location')).toBeNull();
  });

  it('sends an authenticated user at the wrong portal to their own cabinet with denial feedback', () => {
    const response = proxy(appRequest('/app/doctor/patients', 'client'));

    expect(response.headers.get('location')).toBe(
      'https://app.example.test/app/patient?app_access_denied=1',
    );
  });

  it('does not interrupt an authenticated user at their own portal', () => {
    expect(proxy(appRequest('/app/doctor/patients', 'doctor')).headers.get('location')).toBeNull();
  });
});

describe('global admin reaching platform pages under the doctor portal prefix', () => {
  it('lets a platform-operations admin (adminMode) through to /app/doctor/analytics', () => {
    expect(
      proxy(appRequest('/app/doctor/analytics', 'admin', true)).headers.get('location'),
    ).toBeNull();
  });

  it('lets a platform-operations admin through to /app/doctor/booking-merge', () => {
    expect(
      proxy(appRequest('/app/doctor/booking-merge', 'admin', true)).headers.get('location'),
    ).toBeNull();
  });

  it('still denies a platform-operations admin on a clinical-only doctor page', () => {
    const response = proxy(appRequest('/app/doctor/patients', 'admin', true));
    expect(response.headers.get('location')).toBe(
      'https://app.example.test/app/admin/system-health?app_access_denied=1',
    );
  });

  it('denies an admin session without adminMode on the platform-under-doctor page too', () => {
    const response = proxy(appRequest('/app/doctor/analytics', 'admin', false));
    expect(response.headers.get('location')).toBe(
      'https://app.example.test/app/admin/system-health?app_access_denied=1',
    );
  });
});
