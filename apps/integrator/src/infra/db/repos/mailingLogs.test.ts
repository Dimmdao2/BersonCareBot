import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { insertMailingLog } from './mailingLogs.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('mailingLogs (Drizzle onConflict)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('insertMailingLog upserts by (user_id, mailing_id) with status/sentAt/error', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ insert } as never);

    await insertMailingLog({} as DbPort, {
      userId: 10,
      mailingId: 20,
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      userId: 10,
      mailingId: 20,
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
    });
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const arg = onConflictDoUpdate.mock.calls[0][0] as {
      set: { status: string; sentAt: string; error: string | null };
    };
    expect(arg.set).toEqual({
      status: 'sent',
      sentAt: '2026-03-01T12:00:00.000Z',
      error: null,
    });
  });
});
