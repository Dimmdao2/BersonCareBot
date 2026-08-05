/**
 * D15b/6: trusted phone canonical lookup prefers user_contacts assembly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebappSqlExecutor } from '@/infra/db/runWebappSql';
import { findTrustedCanonicalUserIdByPhone } from '@/infra/repos/pgCanonicalPlatformUser';

const drizzleLimitResults = vi.hoisted(() => ({ queue: [] as { id: string }[][] }));

function makeDb(): WebappSqlExecutor {
  const limit = async () => drizzleLimitResults.queue.shift() ?? [];
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            orderBy: () => ({ limit }),
          }),
        }),
        where: () => ({
          orderBy: () => ({ limit }),
        }),
      }),
    }),
  } as unknown as WebappSqlExecutor;
}

const TRUSTED_USER_ID = '00000000-0000-4000-8000-0000000d0f01';
const PHONE = '+79001234567';

beforeEach(() => {
  drizzleLimitResults.queue = [];
});

describe('findTrustedCanonicalUserIdByPhone — D15b/6 user_contacts reader', () => {
  it('resolves trusted owner via primary phone row in user_contacts', async () => {
    drizzleLimitResults.queue = [[{ id: TRUSTED_USER_ID }]];

    const id = await findTrustedCanonicalUserIdByPhone(makeDb(), PHONE);

    expect(id).toBe(TRUSTED_USER_ID);
    expect(drizzleLimitResults.queue).toHaveLength(0);
  });

  it('falls back to platform_users.patient_phone_trust_at when user_contacts has no row', async () => {
    drizzleLimitResults.queue = [[], [{ id: TRUSTED_USER_ID }]];

    const id = await findTrustedCanonicalUserIdByPhone(makeDb(), PHONE);

    expect(id).toBe(TRUSTED_USER_ID);
    expect(drizzleLimitResults.queue).toHaveLength(0);
  });
});
