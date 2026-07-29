import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { readGlobalServerRuntimeString } from './publicRuntimeSettings.js';

function makeDb(query: DbPort['query']): DbPort {
  return { query, tx: vi.fn() as unknown as DbPort['tx'] };
}

describe('publicRuntimeSettings', () => {
  it('reads a scalar through the generic server-runtime accessor', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ value_json: { value: 'https://example.test/' } }],
      rowCount: 1,
    } as DbQueryResult<{ value_json: unknown }>);

    await expect(readGlobalServerRuntimeString(makeDb(query), ' support_phone ')).resolves.toBe(
      'https://example.test/',
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT app.read_global_server_runtime_setting($1) AS value_json',
      ['support_phone'],
    );
  });

  it('returns null for a missing or invalid scalar and rejects an empty key', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ value_json: { value: { nested: true } } }], rowCount: 1 });
    const db = makeDb(query);

    await expect(readGlobalServerRuntimeString(db, 'missing')).resolves.toBeNull();
    await expect(readGlobalServerRuntimeString(db, 'invalid')).resolves.toBeNull();
    await expect(readGlobalServerRuntimeString(db, '   ')).rejects.toThrow(
      'server_runtime_setting_key_required',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
