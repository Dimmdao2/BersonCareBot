/**
 * Кука продолжения приглашения должна доходить ДО ВСЕХ своих потребителей.
 *
 * ЧТО ЛОМАЕТСЯ БЕЗ ЭТОГО ФАЙЛА: путь `'/join'` выглядит правильным — страница приглашения живёт
 * именно там, — но единственные, кто эту куку читает кроме страницы, это двери `/api/join/**`.
 * По RFC 6265 путь `/join` с `/api/join/email/start` не совпадает, браузер куку туда не шлёт, и
 * человек, нажавший «Получить код», получает `invalid_continuation`. На живом TEST 11.09.2026 это
 * и происходило: обмен носителя отвечал 200, а почтовый путь был мёртв целиком.
 *
 * Тест сравнивает объявленный путь с реальными адресами потребителей по правилу path-match из
 * RFC 6265 §5.1.4 — а не с самой строкой пути, иначе он превратится в копию реализации.
 */
import { describe, expect, it, vi } from 'vitest';

const cookieJar = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => cookieJar }));
vi.mock('@/config/env', () => ({ isProduction: true }));

import { issuePatientInviteContinuationCookie } from './continuationCookie';

/** RFC 6265 §5.1.4: путь куки совпадает с адресом запроса. */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

const CONSUMERS = [
  '/join/SOMECONTINUATIONVALUE',
  '/api/join/exchange',
  '/api/join/email/start',
  '/api/join/email/confirm',
];

describe('кука продолжения приглашения', () => {
  it('доходит и до страницы приглашения, и до дверей /api/join', async () => {
    await issuePatientInviteContinuationCookie('c'.repeat(43));

    const options = cookieJar.set.mock.calls.at(-1)?.[2] as { path: string };
    for (const consumer of CONSUMERS) {
      expect(pathMatches(options.path, consumer), consumer).toBe(true);
    }
  });

  it('остаётся недоступной скриптам и уходит только со своего сайта', async () => {
    await issuePatientInviteContinuationCookie('c'.repeat(43));

    const options = cookieJar.set.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(true);
    // Продолжение живёт минуты, а не сутки: это одноразовый пропуск, а не сессия.
    expect(options.maxAge).toBe(10 * 60);
  });
});
