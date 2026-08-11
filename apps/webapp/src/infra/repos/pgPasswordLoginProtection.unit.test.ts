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

import { createPgPasswordLoginProtectionPort } from './pgPasswordLoginProtection';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('createPgPasswordLoginProtectionPort named roots', () => {
  it('keeps both absent ALTCHA values as typed null arguments for password acquire', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [
        {
          status: 'challenge_required',
          lease_token: null,
          password_hash: null,
          user_id: null,
          retry_after_seconds: 30,
          captcha_required: true,
        },
      ],
    });

    await expect(
      createPgPasswordLoginProtectionPort().acquirePasswordProof({
        emailNormalized: 'doctor@example.com',
        identifierKey: 'ip:hash',
      }),
    ).resolves.toMatchObject({ acquired: false, reason: 'challenge_required' });

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.password_login_acquire(text,text,uuid,text)');
    expect(args).toEqual(['doctor@example.com', 'ip:hash', null, null]);
  });
});
