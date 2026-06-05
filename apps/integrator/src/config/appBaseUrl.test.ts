import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../kernel/contracts/index.js';

const envMock = vi.hoisted(() => ({
  APP_BASE_URL: 'https://env.example' as string | undefined,
  LOG_LEVEL: 'silent',
}));

vi.mock('./env.js', () => ({
  env: envMock,
}));

vi.mock('../infra/observability/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import {
  getAppBaseUrl,
  getAppBaseUrlSync,
  invalidateAppBaseUrlCache,
} from './appBaseUrl.js';

function mockDb(query: DbPort['query']): DbPort {
  const db: DbPort = {
    query,
    async tx(fn) {
      return fn(db);
    },
  };
  return db;
}

describe('getAppBaseUrl', () => {
  afterEach(() => {
    invalidateAppBaseUrlCache();
    envMock.APP_BASE_URL = 'https://env.example';
    vi.useRealTimers();
  });

  it('returns normalized URL from public.system_settings and caches for TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    envMock.APP_BASE_URL = 'https://env.example/';
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://db.example/app/' } }],
    });
    const db = mockDb(query);

    const a = await getAppBaseUrl(db);
    const b = await getAppBaseUrl(db);
    expect(a).toBe('https://db.example/app');
    expect(b).toBe('https://db.example/app');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain('public.system_settings');
    expect(query.mock.calls[0]![1]).toEqual(['app_base_url', 'admin']);
  });

  it('falls back to env when setting is missing or invalid', async () => {
    envMock.APP_BASE_URL = 'https://env-fallback.example';
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = mockDb(query);
    expect(await getAppBaseUrl(db)).toBe('https://env-fallback.example');

    invalidateAppBaseUrlCache();
    query.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'not-a-url' } }],
    });
    expect(await getAppBaseUrl(db)).toBe('https://env-fallback.example');
  });

  it('getAppBaseUrlSync returns cached value within TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    envMock.APP_BASE_URL = 'https://env.example';
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://db.example' } }],
    });
    const db = mockDb(query);

    expect(getAppBaseUrlSync()).toBe('https://env.example');
    await getAppBaseUrl(db);
    expect(getAppBaseUrlSync()).toBe('https://db.example');
  });

  it('re-queries after cache invalidation', async () => {
    vi.useFakeTimers({ now: 0 });
    envMock.APP_BASE_URL = 'https://env.example';
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://first.example' } }],
    });
    const db = mockDb(query);

    expect(await getAppBaseUrl(db)).toBe('https://first.example');
    invalidateAppBaseUrlCache();
    query.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'https://second.example' } }],
    });
    expect(await getAppBaseUrl(db)).toBe('https://second.example');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
