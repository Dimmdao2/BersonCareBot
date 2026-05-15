import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const executeMock = vi.hoisted(() => vi.fn());

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: () => ({ execute: executeMock }),
}));

import { getStaleReminderMessengerMessageIdForResend } from './reminders.js';

describe('getStaleReminderMessengerMessageIdForResend', () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it('queries with channel max and returns trimmed maxMessageId', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: '  mid-max-1  ' }] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-a',
      excludeOccurrenceId: 'occ-x',
      channel: 'max',
    });
    expect(r).toBe('mid-max-1');
    expect(executeMock).toHaveBeenCalledTimes(1);
    const arg0 = executeMock.mock.calls[0]?.[0];
    const flat = (n: unknown): string => {
      if (n === null || n === undefined) return '';
      if (typeof n === 'string' || typeof n === 'number' || typeof n === 'boolean') return String(n);
      if (typeof n !== 'object') return '';
      const o = n as Record<string, unknown>;
      if (Array.isArray(o.queryChunks)) return o.queryChunks.map(flat).join('');
      if (Array.isArray(o.value)) return o.value.map(flat).join('');
      return '';
    };
    expect(flat(arg0)).toContain('CASE WHEN');
  });

  it('returns stringified positive int telegram id from numeric string', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: '  42  ' }] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-b',
      excludeOccurrenceId: 'occ-y',
      channel: 'telegram',
    });
    expect(r).toBe('42');
  });

  it('returns null for telegram when messenger id is not numeric', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: 'abc' }] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-c',
      excludeOccurrenceId: 'occ-z',
      channel: 'telegram',
    });
    expect(r).toBeNull();
  });

  it('telegram: truncates fractional numeric string to int string', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: '42.9' }] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-frac',
      excludeOccurrenceId: 'occ-frac',
      channel: 'telegram',
    });
    expect(r).toBe('42');
  });

  it('returns null for telegram when id is zero or negative', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: '0' }] });
    const dbZero = {} as DbPort;
    expect(
      await getStaleReminderMessengerMessageIdForResend(dbZero, {
        ruleId: 'r',
        excludeOccurrenceId: 'o',
        channel: 'telegram',
      }),
    ).toBeNull();
    executeMock.mockResolvedValue({ rows: [{ mid: '-3' }] });
    const dbNeg = {} as DbPort;
    expect(
      await getStaleReminderMessengerMessageIdForResend(dbNeg, {
        ruleId: 'r',
        excludeOccurrenceId: 'o',
        channel: 'telegram',
      }),
    ).toBeNull();
  });

  it('non-telegram non-max channel returns raw trimmed mid from SQL', async () => {
    executeMock.mockResolvedValue({ rows: [{ mid: '  opaque-ref  ' }] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-other',
      excludeOccurrenceId: 'occ-o',
      channel: 'other_channel',
    });
    expect(r).toBe('opaque-ref');
  });

  it('returns null when no row', async () => {
    executeMock.mockResolvedValue({ rows: [] });
    const db = {} as DbPort;
    const r = await getStaleReminderMessengerMessageIdForResend(db, {
      ruleId: 'rule-d',
      excludeOccurrenceId: 'occ-w',
      channel: 'telegram',
    });
    expect(r).toBeNull();
  });
});
