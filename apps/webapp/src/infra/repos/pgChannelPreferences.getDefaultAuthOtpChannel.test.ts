import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  getWebappSqlFromPgClient: vi.fn(),
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
}));
vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/infra/db/withClient', () => ({ withPoolTransaction: vi.fn() }));

import { pgChannelPreferencesPort } from '@/infra/repos/pgChannelPreferences';

describe('pgChannelPreferencesPort.getDefaultAuthOtpChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getWebappSqlDb.mockReturnValue(fakes.db);
  });

  it('prefers the channel that confirmed the current phone over the earliest-linked binding', async () => {
    // Reproduces the reachable F1 case: Telegram linked in 2024 without a phone, the phone later
    // confirmed via Max in 2026 — the earliest-linked query alone would wrongly pick Telegram.
    fakes.runWebappPgText.mockResolvedValueOnce({
      rows: [{ confirming_channel: 'max' }],
    });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('max');
    expect(fakes.runWebappPgText).toHaveBeenCalledOnce();
    expect(fakes.runWebappPgText).toHaveBeenCalledWith(
      expect.stringContaining('FROM user_phone_history'),
      ['user-1'],
    );
  });

  it('falls back to the earliest-linked binding when confirming_channel is NULL (historical row)', async () => {
    fakes.runWebappPgText
      .mockResolvedValueOnce({ rows: [{ confirming_channel: null }] })
      .mockResolvedValueOnce({ rows: [{ code: 'telegram' }] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('telegram');
    expect(fakes.runWebappPgText).toHaveBeenCalledTimes(2);
    expect(fakes.runWebappPgText).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM user_channel_bindings'),
      ['user-1'],
    );
  });

  it('falls back to the earliest-linked binding when no active phone-history row exists', async () => {
    fakes.runWebappPgText
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ code: 'email' }] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBe('email');
    expect(fakes.runWebappPgText).toHaveBeenCalledTimes(2);
  });

  it('never returns SMS as a default even when SMS is the recorded confirming channel', async () => {
    fakes.runWebappPgText
      .mockResolvedValueOnce({ rows: [{ confirming_channel: 'sms' }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await pgChannelPreferencesPort.getDefaultAuthOtpChannel('user-1');

    expect(result).toBeNull();
    expect(fakes.runWebappPgText).toHaveBeenCalledTimes(2);
  });
});

describe('pgChannelPreferencesPort.getPreferredAuthChannelCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getWebappSqlDb.mockReturnValue(fakes.db);
  });

  it('uses the declared pre-session root instead of an unnamed relation transaction', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ channel_code: 'telegram' }] });

    await expect(
      pgChannelPreferencesPort.getPreferredAuthChannelCode(
        '00000000-0000-4000-8000-000000000001',
      ),
    ).resolves.toBe('telegram');

    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.get_preferred_auth_channel_code(uuid)');
    expect(args).toEqual(['00000000-0000-4000-8000-000000000001']);
    expect(fakes.runWebappPgText).not.toHaveBeenCalled();
  });
});
