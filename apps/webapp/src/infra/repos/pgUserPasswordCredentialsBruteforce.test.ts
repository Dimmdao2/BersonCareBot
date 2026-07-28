import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const argonVerifyMock = vi.hoisted(() => vi.fn());
const inspectLockMock = vi.hoisted(() => vi.fn());
const inspectAccountLockMock = vi.hoisted(() => vi.fn());
const recordIdentifierFailureMock = vi.hoisted(() => vi.fn());
const resetIdentifierFailuresMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
  runWebappTransaction: vi.fn(),
}));
vi.mock('argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof import('argon2')>();
  return {
    default: {
      ...actual,
      verify: (...args: unknown[]) => argonVerifyMock(...args),
    },
  };
});
vi.mock('@/modules/auth/passwordLoginProtection', () => ({
  inspectPasswordIdentifierLock: (...args: unknown[]) => inspectLockMock(...args),
  inspectPasswordAccountLock: (...args: unknown[]) => inspectAccountLockMock(...args),
  passwordFailurePrincipalId: () => '22222222-2222-4222-8222-222222222222',
  recordPasswordIdentifierFailure: (...args: unknown[]) => recordIdentifierFailureMock(...args),
  resetPasswordIdentifierFailures: (...args: unknown[]) => resetIdentifierFailuresMock(...args),
  recordPasswordAccountFailure: vi.fn(),
  resetPasswordAccountFailureEvents: vi.fn(),
}));

import { createPgUserPasswordCredentialsPort } from './pgUserPasswordCredentials';
// @ts-expect-error Operational ESM scripts intentionally have no application TypeScript declarations.
import { hashSmokeLoginPassword } from '../../../scripts/converge-saas-smoke-login-passwords.mjs';

describe('pg user password credential brute-force behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inspectLockMock.mockResolvedValue(null);
    inspectAccountLockMock.mockResolvedValue(null);
    argonVerifyMock.mockResolvedValue(false);
    recordIdentifierFailureMock.mockResolvedValue({
      attempts: 5,
      delaySeconds: 30,
      locked: false,
    });
  });

  it('performs the same Argon2 verification and backoff for a missing identifier', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    await expect(
      createPgUserPasswordCredentialsPort().verifyEmailPasswordForLogin(
        'missing@example.test',
        'wrong-password',
      ),
    ).resolves.toEqual({
      ok: false,
      passwordChecked: true,
      attempts: 5,
      delaySeconds: 30,
      locked: false,
    });

    expect(argonVerifyMock).toHaveBeenCalledOnce();
    expect(argonVerifyMock.mock.calls[0]?.[0]).toMatch(/^\$argon2id\$/u);
    expect(recordIdentifierFailureMock).toHaveBeenCalledWith('missing@example.test');
    expect(inspectAccountLockMock).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('rejects a correct password while the account-keyed lock is active', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          password_hash: '$argon2id$real',
          email_verified: true,
        },
      ],
    });
    inspectAccountLockMock.mockResolvedValueOnce({
      attempts: 10,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: 900,
    });

    await expect(
      createPgUserPasswordCredentialsPort().verifyEmailPasswordForLogin(
        'new-owner-email@example.test',
        'correct-password',
      ),
    ).resolves.toEqual({
      ok: false,
      accountUserId: '11111111-1111-4111-8111-111111111111',
      passwordChecked: false,
      attempts: 10,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: 900,
    });

    expect(inspectAccountLockMock).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(argonVerifyMock).not.toHaveBeenCalled();
  });

  it('returns the same public failure state for a real account with a wrong password', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          password_hash: '$argon2id$real',
          email_verified: true,
        },
      ],
    });

    const result = await createPgUserPasswordCredentialsPort().verifyEmailPasswordForLogin(
      'owner@example.test',
      'wrong-password',
    );

    expect(result).toEqual({
      ok: false,
      accountUserId: '11111111-1111-4111-8111-111111111111',
      passwordChecked: true,
      attempts: 5,
      delaySeconds: 30,
      locked: false,
    });
    expect(argonVerifyMock).toHaveBeenCalledWith('$argon2id$real', 'wrong-password');
  });

  it('clears account and identifier state through the ordered successful-proof reset', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ updated: true }] });

    await createPgUserPasswordCredentialsPort().resetFailedPasswordAttempts(
      '11111111-1111-4111-8111-111111111111',
      'owner@example.test',
    );

    expect(resetIdentifierFailuresMock).toHaveBeenCalledWith('owner@example.test');
  });

  it('returns the verified account only after a successful Argon2 proof', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          password_hash: '$argon2id$real',
          email_verified: true,
        },
      ],
    });
    argonVerifyMock.mockResolvedValueOnce(true);

    await expect(
      createPgUserPasswordCredentialsPort().verifyEmailPasswordForLogin(
        'owner@example.test',
        'correct-password',
      ),
    ).resolves.toEqual({
      ok: true,
      userId: '11111111-1111-4111-8111-111111111111',
      emailVerified: true,
    });
  });

  it('accepts the exact Argon2id PHC hash produced by TEST smoke convergence', async () => {
    const plainPassword = 'packet-password';
    const passwordHash = await hashSmokeLoginPassword(plainPassword);
    const actualArgon2 = await vi.importActual<typeof import('argon2')>('argon2');
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: '11111111-1111-4111-8111-111111111111',
          password_hash: passwordHash,
          email_verified: true,
        },
      ],
    });
    argonVerifyMock.mockImplementationOnce((hash: string, password: string) =>
      actualArgon2.verify(hash, password),
    );

    await expect(
      createPgUserPasswordCredentialsPort().verifyEmailPasswordForLogin(
        'owner@example.test',
        plainPassword,
      ),
    ).resolves.toEqual({
      ok: true,
      userId: '11111111-1111-4111-8111-111111111111',
      emailVerified: true,
    });

    expect(argonVerifyMock).toHaveBeenCalledWith(passwordHash, plainPassword);
  });
});
