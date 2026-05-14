import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getStaleReminderMessengerMessageIdForResend } from './reminders.js';

describe('getStaleReminderMessengerMessageIdForResend', () => {
  it('queries with channel max and returns trimmed maxMessageId', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mid: '  mid-max-1  ' }] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-a',
      excludeOccurrenceId: 'occ-x',
      channel: 'max',
    });
    expect(r).toBe('mid-max-1');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    expect(String(sql)).toContain("CASE WHEN $1 = 'max'");
    expect(params).toEqual(['max', 'rule-a', 'occ-x']);
  });

  it('returns stringified positive int telegram id from numeric string', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mid: '  42  ' }] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-b',
      excludeOccurrenceId: 'occ-y',
      channel: 'telegram',
    });
    expect(r).toBe('42');
  });

  it('returns null for telegram when messenger id is not numeric', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mid: 'abc' }] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-c',
      excludeOccurrenceId: 'occ-z',
      channel: 'telegram',
    });
    expect(r).toBeNull();
  });

  it('telegram: truncates fractional numeric string to int string', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mid: '42.9' }] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-frac',
      excludeOccurrenceId: 'occ-frac',
      channel: 'telegram',
    });
    expect(r).toBe('42');
  });

  it('returns null for telegram when id is zero or negative', async () => {
    const dbZero = { query: vi.fn().mockResolvedValue({ rows: [{ mid: '0' }] }) } as unknown as DbPort;
    expect(
      await getStaleReminderMessengerMessageIdForResend(dbZero, {
        ruleId: 'r',
        excludeOccurrenceId: 'o',
        channel: 'telegram',
      }),
    ).toBeNull();
    const dbNeg = { query: vi.fn().mockResolvedValue({ rows: [{ mid: '-3' }] }) } as unknown as DbPort;
    expect(
      await getStaleReminderMessengerMessageIdForResend(dbNeg, {
        ruleId: 'r',
        excludeOccurrenceId: 'o',
        channel: 'telegram',
      }),
    ).toBeNull();
  });

  it('non-telegram non-max channel returns raw trimmed mid from SQL', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ mid: '  opaque-ref  ' }] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-other',
      excludeOccurrenceId: 'occ-o',
      channel: 'other_channel',
    });
    expect(r).toBe('opaque-ref');
  });

  it('returns null when no row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as unknown as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-d',
      excludeOccurrenceId: 'occ-w',
      channel: 'telegram',
    });
    expect(r).toBeNull();
  });
});
