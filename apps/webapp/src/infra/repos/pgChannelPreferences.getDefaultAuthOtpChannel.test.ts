import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
  getWebappSqlFromPgClient: vi.fn(),
}));
vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/infra/db/withClient', () => ({ withPoolTransaction: vi.fn() }));

import { pgChannelPreferencesPort } from '@/infra/repos/pgChannelPreferences';

describe('pgChannelPreferencesPort.getDefaultAuthOtpChannel', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('prefers the channel that confirmed the current phone over the earliest-linked binding', async () => {
    // Reproduces the reachable F1 case: Telegram linked in 2024 without a phone, the phone later
    // confirmed via Max in 2026 — the earliest-linked query alone would wrongly pick Telegram.
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ confirming_channel: 'max' }],
    });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('max');
    expect(runWebappPgTextMock).toHaveBeenCalledOnce();
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_phone_history'),
      ['user-1'],
    );
  });

  it('falls back to the earliest-linked binding when confirming_channel is NULL (historical row)', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ confirming_channel: null }] })
      .mockResolvedValueOnce({ rows: [{ code: 'telegram' }] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('telegram');
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
    expect(runWebappPgTextMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM user_channel_bindings'),
      ['user-1'],
    );
  });

  it('falls back to the earliest-linked binding when no active phone-history row exists', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ code: 'email' }] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('email');
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });

  it('never returns SMS as a default even when SMS is the recorded confirming channel', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ confirming_channel: 'sms' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBeNull();
    expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
  });
});
