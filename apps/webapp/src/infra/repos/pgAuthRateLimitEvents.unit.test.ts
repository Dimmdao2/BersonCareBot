import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { recordAndCountAuthRateLimitEvent } from './pgAuthRateLimitEvents';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('auth rate-limit atomic named root', () => {
  it('binds the exact admission semantics and bounded scope cleanup in one call', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ limited: false, attempts: 3 }],
    });

    await expect(
      recordAndCountAuthRateLimitEvent({
        scope: 'auth.oauth_start',
        key: 'ip:v1:hash',
        windowMs: 60_000.9,
        maxPerWindow: 10.8,
        scopePrune: { retentionMs: 30_000, batchSize: 5_000 },
      }),
    ).resolves.toEqual({ limited: false, attempts: 3 });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledOnce();
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe(
      'app.auth_rate_limit_check_and_record(text,text,integer,integer,text,integer,integer)',
    );
    expect(args).toEqual([
      'auth.oauth_start',
      'ip:v1:hash',
      60_000,
      10,
      'check_and_record',
      60_000,
      1_000,
    ]);
  });

  it('fails closed when the admission root returns no decision', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [] });

    await expect(
      recordAndCountAuthRateLimitEvent({
        scope: 'auth.email_otp_start',
        key: 'ip:v1:hash',
        windowMs: 60_000,
        maxPerWindow: 10,
      }),
    ).rejects.toThrow('auth rate-limit root returned no result');
  });
});
