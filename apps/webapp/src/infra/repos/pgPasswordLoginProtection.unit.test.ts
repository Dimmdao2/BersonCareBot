import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentDbPrincipal,
  runWithDbPatientPrincipal,
} from '@bersoncare/db-principal';

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

const selfUserId = '00000000-0000-4000-8000-000000000017';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('password-login pre-session principal boundary', () => {
  it('borrows bootstrap only for password-proof acquisition and restores the caller', async () => {
    let principalAtDoor: string | undefined;
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      principalAtDoor = getCurrentDbPrincipal()?.kind;
      return {
        rows: [
          {
            status: 'acquired',
            lease_token: '00000000-0000-4000-8000-000000000018',
            password_hash: 'hash',
            user_id: selfUserId,
            retry_after_seconds: 0,
            captcha_required: false,
          },
        ],
      };
    });

    await runWithDbPatientPrincipal({ platformUserId: selfUserId }, async () => {
      await expect(
        createPgPasswordLoginProtectionPort().acquirePasswordProof({
          emailNormalized: 'doctor@example.com',
          identifierKey: 'password-email:v1:key',
        }),
      ).resolves.toMatchObject({ acquired: true, userId: selfUserId });
      expect(principalAtDoor).toBe('bootstrap');
      expect(getCurrentDbPrincipal()?.kind).toBe('patient');
    });
  });

  it('borrows bootstrap only for password-proof completion and restores the caller', async () => {
    let principalAtDoor: string | undefined;
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      principalAtDoor = getCurrentDbPrincipal()?.kind;
      return {
        rows: [
          {
            accepted: true,
            succeeded: true,
            user_id: selfUserId,
            email_verified: true,
            attempts: 0,
            retry_after_seconds: 0,
            captcha_required: false,
          },
        ],
      };
    });

    await runWithDbPatientPrincipal({ platformUserId: selfUserId }, async () => {
      await expect(
        createPgPasswordLoginProtectionPort().completePasswordProof({
          leaseToken: '00000000-0000-4000-8000-000000000018',
          passwordVerified: true,
        }),
      ).resolves.toMatchObject({ accepted: true, succeeded: true, userId: selfUserId });
      expect(principalAtDoor).toBe('bootstrap');
      expect(getCurrentDbPrincipal()?.kind).toBe('patient');
    });
  });

  it('restores the caller when password-proof completion throws inside bootstrap scope', async () => {
    let principalAtDoor: string | undefined;
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      principalAtDoor = getCurrentDbPrincipal()?.kind;
      throw new Error('door_failed');
    });

    await runWithDbPatientPrincipal({ platformUserId: selfUserId }, async () => {
      await expect(
        createPgPasswordLoginProtectionPort().completePasswordProof({
          leaseToken: '00000000-0000-4000-8000-000000000018',
          passwordVerified: true,
        }),
      ).rejects.toThrow('door_failed');
      expect(principalAtDoor).toBe('bootstrap');
      expect(getCurrentDbPrincipal()?.kind).toBe('patient');
    });
  });

});
