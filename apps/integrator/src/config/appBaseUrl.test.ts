import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { DbPort } from '../kernel/contracts/index.js';

vi.mock('../infra/observability/logger.js', () => ({
  logger: { error: vi.fn() },
}));

import {
  getAppBaseUrl,
  getAppBaseUrlSync,
  invalidateAppBaseUrlCache,
  resetAppBaseUrlCacheForTests,
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
    resetAppBaseUrlCacheForTests();
    vi.useRealTimers();
  });

  it('returns normalized URL from the generic runtime accessor and caches for TTL', async () => {
    vi.useFakeTimers({ now: 0 });
    const query = vi.fn().mockImplementation(async () => {
      expect(getCurrentDbPrincipal()).toEqual({
        kind: 'bootstrap',
        source: 'integrator-server-runtime-config',
      });
      return { rows: [{ value_json: { value: 'https://db.example/app/' } }] };
    });
    const db = mockDb(query);

    const a = await getAppBaseUrl(db);
    const b = await getAppBaseUrl(db);
    expect(a).toBe('https://db.example/app');
    expect(b).toBe('https://db.example/app');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toContain('app.read_global_server_runtime_setting');
    expect(query.mock.calls[0]![1]).toEqual(['app_base_url']);
  });

  it('fails closed when the DB setting is missing or invalid', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = mockDb(query);
    await expect(getAppBaseUrl(db)).rejects.toThrow('app_base_url_runtime_setting_missing');

    invalidateAppBaseUrlCache();
    query.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'not-a-url' } }],
    });
    await expect(getAppBaseUrl(db)).rejects.toThrow('app_base_url_runtime_setting_invalid');
  });

  it('getAppBaseUrlSync requires startup initialization and keeps the last DB value', async () => {
    vi.useFakeTimers({ now: 0 });
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://db.example' } }],
    });
    const db = mockDb(query);

    expect(() => getAppBaseUrlSync()).toThrow('app_base_url_runtime_setting_not_initialized');
    await getAppBaseUrl(db);
    expect(getAppBaseUrlSync()).toBe('https://db.example');
    vi.advanceTimersByTime(120_000);
    expect(getAppBaseUrlSync()).toBe('https://db.example');
  });

  it('keeps sync consumers on the last successful URL and re-queries async after invalidation', async () => {
    vi.useFakeTimers({ now: 0 });
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://first.example' } }],
    });
    const db = mockDb(query);

    expect(await getAppBaseUrl(db)).toBe('https://first.example');
    invalidateAppBaseUrlCache();
    expect(getAppBaseUrlSync()).toBe('https://first.example');
    query.mockResolvedValueOnce({
      rows: [{ value_json: { value: 'https://second.example' } }],
    });
    expect(await getAppBaseUrl(db)).toBe('https://second.example');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
