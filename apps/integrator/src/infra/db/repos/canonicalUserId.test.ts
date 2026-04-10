import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  canonicalizeIntegratorUserIdKeysInObject,
  resolveCanonicalIntegratorUserId,
  resolveCanonicalUserIdFromIdentityId,
} from './canonicalUserId.js';

function makeDb(queryImpl: ReturnType<typeof vi.fn>): DbPort {
  return { query: queryImpl, tx: vi.fn() } as unknown as DbPort;
}

describe('resolveCanonicalIntegratorUserId', () => {
  it('returns input unchanged for non-numeric ids', async () => {
    const query = vi.fn();
    const db = makeDb(query);
    await expect(resolveCanonicalIntegratorUserId(db, 'uid-tg')).resolves.toBe('uid-tg');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns same id when user row missing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = makeDb(query);
    await expect(resolveCanonicalIntegratorUserId(db, '999')).resolves.toBe('999');
  });

  it('returns same id when merged_into_user_id is null', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ merged_into_user_id: null }] });
    const db = makeDb(query);
    await expect(resolveCanonicalIntegratorUserId(db, '5')).resolves.toBe('5');
  });

  it('follows a chain of merge hops', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: '9' }] })
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: '12' }] })
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: null }] });
    const db = makeDb(query);
    await expect(resolveCanonicalIntegratorUserId(db, '5')).resolves.toBe('12');
    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe('canonical user id from identity row', () => {
  it('returns identity id when identity row missing', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = makeDb(query);
    await expect(resolveCanonicalUserIdFromIdentityId(db, '42')).resolves.toBe('42');
  });

  it('maps identity to canonical user id', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ user_id: '7' }] })
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: null }] });
    const db = makeDb(query);
    await expect(resolveCanonicalUserIdFromIdentityId(db, '42')).resolves.toBe('7');
  });
});

describe('appointment payloadJson user id keys', () => {
  it('rewrites integrator_user_id and integratorUserId to canonical', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: '100' }] })
      .mockResolvedValueOnce({ rows: [{ merged_into_user_id: null }] });
    const db = makeDb(query);
    const obj: Record<string, unknown> = {
      integrator_user_id: '2',
      integratorUserId: 3,
      link: 'https://x',
    };
    await canonicalizeIntegratorUserIdKeysInObject(db, obj);
    expect(obj.integratorUserId).toBe('3');
    expect(obj.integrator_user_id).toBe('100');
    expect(obj.link).toBe('https://x');
  });
});
