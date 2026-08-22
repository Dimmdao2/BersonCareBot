import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';
import { encodeSessionCookie } from '@/modules/auth/sessionCookie';
import { SESSION_COOKIE_NAME } from '@/modules/auth/sessionCookieNames';
import type { AppSession, UserRole } from '@/shared/types/session';
import { SURFACE_PATHNAME_HEADER, SURFACE_SEARCH_HEADER } from '@/config/surfaceRoutes';

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

function appRequest(pathname: string, role?: UserRole): NextRequest {
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

  it('sends a doctor from a patient content route to their own cabinet with denial feedback', () => {
    const response = proxy(appRequest('/app/patient/profile', 'doctor'));

    expect(response.headers.get('location')).toBe(
      'https://app.example.test/app/doctor?app_access_denied=1',
    );
  });

  it('does not interrupt an authenticated user at their own portal', () => {
    expect(proxy(appRequest('/app/doctor/patients', 'doctor')).headers.get('location')).toBeNull();
  });
});

describe('global admin reaching platform pages under the doctor portal prefix', () => {
  it('lets a platform-operations admin through to /app/doctor/analytics', () => {
    expect(proxy(appRequest('/app/doctor/analytics', 'admin')).headers.get('location')).toBeNull();
  });

  it('lets a platform-operations admin through to /app/doctor/booking-merge', () => {
    expect(
      proxy(appRequest('/app/doctor/booking-merge', 'admin')).headers.get('location'),
    ).toBeNull();
  });

  it('still denies a platform-operations admin on a clinical-only doctor page', () => {
    const response = proxy(appRequest('/app/doctor/patients', 'admin'));
    expect(response.headers.get('location')).toBe(
      'https://app.example.test/app/admin/system-health?app_access_denied=1',
    );
  });
});

/**
 * Гейт круга 4 закрывал «ГДЕ ставится заголовок поверхности» (накрытие `config.matcher`), но не «ЧТО
 * ставится»: удаление строки `requestHeaders.set(SURFACE_PATHNAME_HEADER, …)` в `proxy.ts` молча
 * возвращало сразу три уже закрытые находки (`?intent=specialist`, `?from=clinic-demo`,
 * `?from=staff-factor` снова отдавали пациентское имя) при полностью зелёном наборе тестов.
 * Находка `R4-1` аудита круга 4.
 */
describe('proxy доносит до layout путь и строку запроса поверхности', () => {
  function requestHeaderFromProxy(
    path: string,
    header: string,
    role?: UserRole,
  ): string | null {
    const response = proxy(appRequest(path, role));
    return response.headers.get(`x-middleware-request-${header}`);
  }

  it.each([
    ['/', undefined],
    ['/app/doctor/login', undefined],
    ['/app/patient', 'client' as UserRole],
    ['/app/doctor/patients', 'doctor' as UserRole],
  ])('кладёт %s в заголовок пути', (path, role) => {
    expect(requestHeaderFromProxy(path, SURFACE_PATHNAME_HEADER, role)).toBe(path);
  });

  it('кладёт строку запроса — без неё различимые по параметру staff-адреса снова станут пациентскими', () => {
    expect(
      requestHeaderFromProxy('/app/contact-support?from=clinic-demo', SURFACE_SEARCH_HEADER),
    ).toBe('?from=clinic-demo');
    expect(requestHeaderFromProxy('/app?intent=specialist', SURFACE_SEARCH_HEADER)).toBe(
      '?intent=specialist',
    );
  });
});

