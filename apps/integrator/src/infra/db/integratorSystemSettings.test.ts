import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { isGlobalOperatorSmsReady } from './integratorSystemSettings.js';

function dbWith(values: unknown[]): DbPort {
  return { query: vi.fn().mockImplementation(async () => ({ rows: values.length ? [{ value_json: values.shift() }] : [] })), tx: vi.fn() as never };
}

describe('isGlobalOperatorSmsReady', () => {
  it('requires enabled=true and a non-empty mirrored key', async () => {
    await expect(isGlobalOperatorSmsReady(dbWith([{ value: true }, { value: 'key' }]))).resolves.toBe(true);
    await expect(isGlobalOperatorSmsReady(dbWith([{ value: false }, { value: 'key' }]))).resolves.toBe(false);
    await expect(isGlobalOperatorSmsReady(dbWith([{ value: true }, { value: '' }]))).resolves.toBe(false);
  });

  it('fails closed for missing rows and read failures', async () => {
    await expect(isGlobalOperatorSmsReady(dbWith([]))).resolves.toBe(false);
    const db = dbWith([]);
    vi.mocked(db.query).mockRejectedValueOnce(new Error('read failed'));
    await expect(isGlobalOperatorSmsReady(db)).resolves.toBe(false);
  });
});
