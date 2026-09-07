import { NextResponse } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  buildFreshLoginMarkerCookieOptions,
  buildSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '@/modules/auth/sessionCookie';
import type { AppSession } from '@/shared/types/session';

/**
 * Инвариант «cookie host-only, cross-domain SSO нет»
 * (`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md` §1,
 * инвариант 4; план `IMPLEMENTATION_PLAN.md` `B6`).
 *
 * Смысл: сессия обязана остаться на том host, где человек вошёл. Как только у любой cookie
 * появляется атрибут `Domain`, она поднимается на parent-domain и `klinika.therapygo.ru`
 * начинает делить сессию с `therapygo.ru` и со всеми остальными клиниками — это ровно тот
 * cross-domain SSO, который план держит в «сознательно не делаем» (§4). Регрессия молчаливая:
 * приложение продолжает работать, стена между арендаторами исчезает без единой ошибки.
 *
 * Поведение проверяется по реальным заголовкам `Set-Cookie` публичных builder'ов.
 */

const session: AppSession = {
  user: {
    userId: '00000000-0000-4000-8000-000000000001',
    role: 'client',
    displayName: 'Host-only invariant',
    bindings: {},
    sessionEpoch: 1,
  },
  issuedAt: 1_700_000_000,
  expiresAt: 1_700_003_600,
};

function setCookieHeadersFor(options: Record<string, unknown>): string[] {
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE_NAME, 'value', options);
  return response.headers.getSetCookie();
}

describe('session cookie stays host-only', () => {
  it('emits no Domain attribute for the session cookie', () => {
    const headers = setCookieHeadersFor(buildSessionCookieOptions(session));
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.toLowerCase()).not.toContain('domain=');
  });

  it('emits no Domain attribute for the fresh-login marker cookie', () => {
    const headers = setCookieHeadersFor(buildFreshLoginMarkerCookieOptions());
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.toLowerCase()).not.toContain('domain=');
  });
});
