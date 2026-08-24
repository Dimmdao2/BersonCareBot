import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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
 * Два уровня, потому что одного мало:
 *  1. поведение — реальный заголовок `Set-Cookie` наших builder'ов не несёт `Domain`;
 *  2. структурный backstop — ни один writer в `src/` не передаёт `domain` в опции cookie.
 *     Builder'ов два, а мест записи cookie — десять; поведенческий тест накрыл бы только два.
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

  it('has no cookie writer anywhere in the webapp that sets a domain attribute', () => {
    const srcRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
    );
    const files = readdirSync(srcRoot, { recursive: true, encoding: 'utf8' })
      .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
      .map((entry) => path.join(srcRoot, entry));

    const offenders: string[] = [];
    for (const file of files) {
      if (!statSync(file).isFile()) continue;
      const source = readFileSync(file, 'utf8');
      // Ищем только окрестности записи cookie: `domain` — частое имя доменного поля
      // (recommendations, catalog filters), и слепой поиск по слову дал бы шум.
      const writeSites = /(?:cookies\(\)|cookies|cookieStore)\s*\.set\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = writeSites.exec(source)) !== null) {
        const window = source.slice(match.index, match.index + 600);
        if (/\bdomain\s*:/i.test(window)) {
          offenders.push(`${path.relative(srcRoot, file)} @ ${match.index}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
