import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { getReminderOccurrenceContextForProjection } from './reminders.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('getReminderOccurrenceContextForProjection (Drizzle select+join)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when occurrence row is missing', async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const ctx = await getReminderOccurrenceContextForProjection({} as DbPort, 'occ-missing');
    expect(ctx).toBeNull();
  });

  it('maps sent occurrence to occurredAt from sent_at', async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        rule_id: 'rule-a',
        user_id: '7',
        category: 'med',
        status: 'sent',
        sent_at: '2026-04-10T08:00:00.000Z',
        failed_at: null,
        delivery_channel: 'telegram',
        error_code: null,
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const ctx = await getReminderOccurrenceContextForProjection({} as DbPort, 'occ-1');
    expect(ctx).toEqual({
      ruleId: 'rule-a',
      userId: '7',
      category: 'med',
      status: 'sent',
      occurredAt: '2026-04-10T08:00:00.000Z',
      deliveryChannel: 'telegram',
      errorCode: null,
    });
  });

  it('prefers sent_at over failed_at when both present', async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        rule_id: 'rule-b',
        user_id: '8',
        category: 'exercise',
        status: 'sent',
        sent_at: '2026-04-11T09:00:00.000Z',
        failed_at: '2026-04-11T10:00:00.000Z',
        delivery_channel: 'max',
        error_code: null,
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const ctx = await getReminderOccurrenceContextForProjection({} as DbPort, 'occ-2');
    expect(ctx?.occurredAt).toBe('2026-04-11T09:00:00.000Z');
  });

  it('uses failed_at when sent_at is null', async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        rule_id: 'rule-c',
        user_id: '9',
        category: 'exercise',
        status: 'failed',
        sent_at: null,
        failed_at: '2026-04-12T11:00:00.000Z',
        delivery_channel: 'telegram',
        error_code: 'timeout',
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const ctx = await getReminderOccurrenceContextForProjection({} as DbPort, 'occ-3');
    expect(ctx?.occurredAt).toBe('2026-04-12T11:00:00.000Z');
    expect(ctx?.status).toBe('failed');
    expect(ctx?.errorCode).toBe('timeout');
  });
});
