import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import {
  getUserSubscriptions,
  toggleUserSubscription,
  upsertUserSubscription,
} from './subscriptions.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

function createDbMock() {
  const queryMock = vi.fn();
  const txMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: txMock as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('subscriptions repo (canonical user_id)', () => {
  it('reads subscriptions by canonical user_id', async () => {
    const { db } = createDbMock();
    const mockWhere = vi.fn().mockResolvedValue([{ topicId: 1 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select: mockSelect } as never);

    const res = await getUserSubscriptions(db, 42);

    expect(res).toEqual(new Set([1]));
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
  });

  it('upserts subscription by canonical user_id', async () => {
    const { db } = createDbMock();
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert: mockInsert } as never);

    await upsertUserSubscription(db, 7, 3, true);

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({ userId: 7, topicId: 3, isActive: true });
    expect(mockOnConflict).toHaveBeenCalledTimes(1);
  });

  it('toggles subscription by canonical user_id', async () => {
    const { db } = createDbMock();
    const mockOnConflict = vi.fn().mockResolvedValue(undefined);
    const mockUpsertValues = vi.fn().mockReturnValue({ onConflictDoUpdate: mockOnConflict });
    const mockUpsertInsert = vi.fn().mockReturnValue({ values: mockUpsertValues });

    const mockLimit = vi.fn().mockResolvedValue([{ isActive: false }]);
    const mockToggleWhere = vi.fn().mockReturnValue({ limit: mockLimit });
    const mockToggleFrom = vi.fn().mockReturnValue({ where: mockToggleWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockToggleFrom });

    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({
      select: mockSelect,
      insert: mockUpsertInsert,
    } as never);

    const next = await toggleUserSubscription(db, 7, 9);

    expect(next).toBe(true);
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockUpsertInsert).toHaveBeenCalledTimes(1);
    expect(mockUpsertValues).toHaveBeenCalledWith({ userId: 7, topicId: 9, isActive: true });
  });
});
