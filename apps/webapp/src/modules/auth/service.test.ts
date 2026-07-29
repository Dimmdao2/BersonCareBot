import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { encodeBase64Url } from '@/shared/utils/base64url';
import { exchangeIntegratorToken } from './service';
import {
  sessionAbsoluteMaxAgeSecondsForRole,
  sessionTtlSecondsForRole,
} from './sessionCookie';

const TEST_ENTRY_SECRET = 'test-integrator-entry-secret';
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: async () => TEST_ENTRY_SECRET,
  getTelegramBotToken: async () => '',
  getMaxBotApiKey: async () => '',
}));

function signPayload(payload: string): string {
  return createHmac('sha256', TEST_ENTRY_SECRET).update(payload).digest('base64url');
}

describe('auth service', () => {
  // Раньше обе проверки читали sessionCookie.ts и искали в ТЕКСТЕ `const ... = 60 * 60 * 24 * 30`.
  // Это ничего не гарантировало: константа могла быть объявлена верно, а использоваться другая.
  // Спрашиваем у кода то, что реально решает срок жизни сессии, — функцию выбора по роли.
  const DAY = 60 * 60 * 24;

  it('клиентская сессия живёт 30 дней простоя, служебная — 12 часов (S2 remedy 2026-07-25)', () => {
    expect(sessionTtlSecondsForRole('client')).toBe(30 * DAY);
    expect(sessionTtlSecondsForRole('doctor')).toBe(12 * 60 * 60);
    expect(sessionTtlSecondsForRole('admin')).toBe(12 * 60 * 60);
  });

  it('потолок возраста сессии: клиент 90 дней, служебная 7 дней — продлением его не обойти', () => {
    expect(sessionAbsoluteMaxAgeSecondsForRole('client')).toBe(90 * DAY);
    expect(sessionAbsoluteMaxAgeSecondsForRole('doctor')).toBe(7 * DAY);
    expect(sessionAbsoluteMaxAgeSecondsForRole('admin')).toBe(7 * DAY);
    // Потолок обязан быть строго больше срока простоя, иначе продление бессмысленно.
    expect(sessionAbsoluteMaxAgeSecondsForRole('client')).toBeGreaterThan(
      sessionTtlSecondsForRole('client'),
    );
    expect(sessionAbsoluteMaxAgeSecondsForRole('doctor')).toBeGreaterThan(
      sessionTtlSecondsForRole('doctor'),
    );
  });

  it('returns null for malformed signed integrator token payload', async () => {
    const payload = encodeBase64Url('not-json');
    const signature = signPayload(payload);
    const token = `${payload}.${signature}`;

    await expect(exchangeIntegratorToken(token)).resolves.toBeNull();
  });
});
