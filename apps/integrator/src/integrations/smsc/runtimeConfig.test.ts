import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getSmscApiKey, getSmscRuntimeConfig, isSmscProviderReady } from './runtimeConfig.js';

function dbWith(values: unknown[]): DbPort {
  return {
    query: vi
      .fn()
      .mockImplementation(async () => ({
        rows: values.length ? [{ value_json: values.shift() }] : [],
      })),
    tx: vi.fn() as never,
  };
}

describe('SMSC runtime config', () => {
  it('uses canonical public.system_settings for readiness and the actual client credential', async () => {
    await expect(
      getSmscRuntimeConfig(dbWith([{ value: true }, { value: 'db-key' }])),
    ).resolves.toEqual({
      enabled: true,
      apiKey: 'db-key',
    });
    await expect(isSmscProviderReady(dbWith([{ value: true }, { value: 'db-key' }]))).resolves.toBe(
      true,
    );
    await expect(getSmscApiKey(dbWith([{ value: true }, { value: 'db-key' }]))).resolves.toBe(
      'db-key',
    );
  });

  it('fails closed for disabled, missing credential, and read failure', async () => {
    await expect(
      isSmscProviderReady(dbWith([{ value: false }, { value: 'db-key' }])),
    ).resolves.toBe(false);
    await expect(isSmscProviderReady(dbWith([{ value: true }, { value: '' }]))).resolves.toBe(
      false,
    );
    const db = dbWith([]);
    vi.mocked(db.query).mockRejectedValueOnce(new Error('read failed'));
    await expect(getSmscRuntimeConfig(db)).resolves.toEqual({ enabled: false, apiKey: '' });
  });
});
