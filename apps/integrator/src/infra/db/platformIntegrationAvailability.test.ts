import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import {
  invalidatePlatformIntegrationAvailabilityCache,
  isPlatformIntegrationAvailable,
  parsePlatformIntegrationAvailability,
} from './platformIntegrationAvailability.js';

function makeDb(query: DbPort['query']): DbPort {
  return { query, tx: vi.fn() as unknown as DbPort['tx'] };
}

const persistedValue = {
  value: {
    version: 1,
    integrations: {
      telegram: false,
      max: true,
      email: false,
      smsc: true,
      web_push: false,
      google_calendar: true,
      yandex_calendar: false,
    },
  },
};

describe('platformIntegrationAvailability runtime reader', () => {
  beforeEach(() => {
    invalidatePlatformIntegrationAvailabilityCache();
  });

  it('parses the object envelope persisted by migration 0264', () => {
    expect(parsePlatformIntegrationAvailability(persistedValue)?.integrations).toEqual(
      persistedValue.value.integrations,
    );
  });

  it('reads explicit channel switches and caches the global registry', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: persistedValue }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>);
    const db = makeDb(query);

    await expect(isPlatformIntegrationAvailable(db, 'telegram')).resolves.toBe(false);
    await expect(isPlatformIntegrationAvailable(db, 'max')).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves wired adapters and keeps declared Yandex off when the row is absent', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const db = makeDb(query);

    await expect(isPlatformIntegrationAvailable(db, 'email')).resolves.toBe(true);
    await expect(isPlatformIntegrationAvailable(db, 'yandex_calendar')).resolves.toBe(false);
  });
});
