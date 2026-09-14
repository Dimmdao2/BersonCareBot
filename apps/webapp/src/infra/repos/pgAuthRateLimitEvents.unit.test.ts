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

import { recordAndCountAuthRateLimitEvent } from './pgAuthRateLimitEvents';

const selfUserId = '00000000-0000-4000-8000-000000000017';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getWebappSqlDb.mockReturnValue(fakes.db);
});

describe('auth rate-limit pre-session principal boundary', () => {
  it('records under bootstrap and restores the signed-in caller', async () => {
    let principalAtDoor: string | undefined;
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      principalAtDoor = getCurrentDbPrincipal()?.kind;
      return { rows: [{ limited: false, attempts: 3 }] };
    });

    await runWithDbPatientPrincipal({ platformUserId: selfUserId }, async () => {
      await expect(
        recordAndCountAuthRateLimitEvent({
          scope: 'auth.confirm',
          key: 'ip:v1:key',
          windowMs: 60_000,
          maxPerWindow: 10,
        }),
      ).resolves.toEqual({ limited: false, attempts: 3 });
      expect(principalAtDoor).toBe('bootstrap');
      expect(getCurrentDbPrincipal()?.kind).toBe('patient');
    });
  });

  it('restores the signed-in caller when the rate-limit door throws', async () => {
    let principalAtDoor: string | undefined;
    fakes.runWebappNamedRoot.mockImplementation(async () => {
      principalAtDoor = getCurrentDbPrincipal()?.kind;
      throw new Error('door_failed');
    });

    await runWithDbPatientPrincipal({ platformUserId: selfUserId }, async () => {
      await expect(
        recordAndCountAuthRateLimitEvent({
          scope: 'auth.confirm',
          key: 'ip:v1:key',
          windowMs: 60_000,
          maxPerWindow: 10,
        }),
      ).rejects.toThrow('door_failed');
      expect(principalAtDoor).toBe('bootstrap');
      expect(getCurrentDbPrincipal()?.kind).toBe('patient');
    });
  });
});
