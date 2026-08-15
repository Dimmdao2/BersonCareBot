import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PasswordLoginProtectionPort } from '@/modules/auth/passwordLoginProtectionPort';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappPgText: vi.fn(),
  runWebappTransaction: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappPgText: fakes.runWebappPgText,
  runWebappTransaction: fakes.runWebappTransaction,
}));

import { createPgUserPasswordCredentialsPort } from './pgUserPasswordCredentials';

const protection: PasswordLoginProtectionPort = {
  acquirePasswordProof: vi.fn(),
  completePasswordProof: vi.fn(),
  readAltchaRootSecret: vi.fn(),
  registerAltchaChallenge: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('createPgUserPasswordCredentialsPort named roots', () => {
  it('uses the declared pre-session root for a password-reset candidate lookup', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ id: 'user-1' }] });

    await expect(
      createPgUserPasswordCredentialsPort(protection).findVerifiedUserIdWithPassword(
        'doctor@example.com',
      ),
    ).resolves.toBe('user-1');

    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.email_password_find_reset_candidate(text)');
    expect(args).toEqual(['doctor@example.com']);
  });
});
