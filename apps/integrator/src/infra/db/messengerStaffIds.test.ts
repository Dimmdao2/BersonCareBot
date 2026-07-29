import { describe, expect, it, vi } from 'vitest';
import { createMessengerStaffIdsResolver, parseIdTokens } from './messengerStaffIds.js';
import type { DbPort } from '../../kernel/contracts/index.js';

describe('parseIdTokens', () => {
  it('parses comma-separated string', () => {
    expect(parseIdTokens('1, 2; 3')).toEqual(['1', '2', '3']);
  });

  it('parses JSON array', () => {
    expect(parseIdTokens(['10', '20'])).toEqual(['10', '20']);
  });

  it('dedupes tokens', () => {
    expect(parseIdTokens('5,5,6')).toEqual(['5', '6']);
  });
});

describe('createMessengerStaffIdsResolver', () => {
  it('re-reads both staff settings for every lookup', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value_json: { value: [] } }] });
    const db = { query } as unknown as DbPort;
    const resolve = createMessengerStaffIdsResolver(db);
    await resolve('telegram', '1');
    await resolve('telegram', '2');
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('returns true for doctor id in doctor_telegram_ids', async () => {
    const db = {
      query: async (_sql: string, params?: unknown[]) => {
        const key = params?.[0];
        if (key === 'doctor_telegram_ids') {
          return { rows: [{ value_json: { value: ['999888'] } }] };
        }
        if (key === 'admin_telegram_ids') {
          return { rows: [{ value_json: { value: [] } }] };
        }
        return { rows: [] };
      },
    } as unknown as DbPort;

    const resolve = createMessengerStaffIdsResolver(db);
    expect(await resolve('telegram', '999888')).toBe(true);
  });

  it('returns false when id not in lists', async () => {
    const db = {
      query: async () => ({ rows: [{ value_json: { value: [] } }] }),
    } as unknown as DbPort;

    const resolve = createMessengerStaffIdsResolver(db);
    expect(await resolve('telegram', '111222')).toBe(false);
  });
});
