import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRateLimitCheckParams } from './authRateLimitPort';

vi.mock('@/config/env', () => ({
  env: {},
  webappRuntimeDatabaseIsConfigured: () => true,
}));

vi.mock('@/infra/logging/logger', () => ({
  logger: { warn: vi.fn() },
}));

import {
  bindAuthRateLimitDbPort,
  isPublicBookingCreateRateLimited,
  isPublicLeadSubmitRateLimited,
} from './authRateLimits';

describe('independent public write rate-limit buckets', () => {
  const attempts = new Map<string, number>();

  beforeEach(() => {
    attempts.clear();
    bindAuthRateLimitDbPort({
      checkAndRecord: async ({ scope, key, maxPerWindow }: AuthRateLimitCheckParams) => {
        const bucket = `${scope}:${key}`;
        const count = attempts.get(bucket) ?? 0;
        if (count >= maxPerWindow) return true;
        attempts.set(bucket, count + 1);
        return false;
      },
      recordAndCount: async () => ({ limited: false, attempts: 0 }),
    });
  });

  /**
   * Д6: исчерпав публичную запись, один посетитель не должен молча закрыть клинике приём заявок.
   * Проверяется решение обеих публичных функций, а не строка scope или аргумент DB-заглушки.
   */
  it('исчерпанная запись не расходует отдельное ведро заявки', async () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(await isPublicBookingCreateRateLimited('ip-1')).toBe(false);
    }
    expect(await isPublicBookingCreateRateLimited('ip-1')).toBe(true);
    expect(await isPublicLeadSubmitRateLimited('ip-1')).toBe(false);
  });
});

