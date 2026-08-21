/**
 * D25 independent audit (auditor-live, 2026-08-22) — the `user.phone.link` external contract that
 * D15b/2 and Р-D26 require to survive the writer removal.
 *
 * These drive `createDbWritePort` over a plain `DbPort` fake (as the candidate's own suite does), so
 * they isolate the CONTRACT from the port-context reachability question covered in
 * `writePort.identityRootReachability.audit.test.ts`.
 *
 * Named failures:
 *  1. A dropped connection while binding the phone is reported as a DEFINITE refusal, so the caller
 *     tells the person "не удалось сохранить" and never retries a bind that may in fact be pending.
 *  2. A phone/merge conflict leaves NO durable case for the human who must decide the merge (Р-D26:
 *     the integrator may not decide it), or leaves a case naming only one of the two accounts, so the
 *     reviewer cannot see whom the number collides with and two distinct conflicts sharing a source
 *     collapse under one `conflict_key`.
 *  3. An ambiguous merge is silently applied or silently dropped instead of being refused.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../principal/organizationPrincipal.js';

const fakes = vi.hoisted(() => ({ recordBlocked: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./repos/messengerPhoneBindAudit.js', () => ({
  recordMessengerPhoneBindBlocked: fakes.recordBlocked,
}));

const { createDbWritePort } = await import('./writePort.js');

const ORG = '00000000-0000-4000-8000-000000000abc';
const SOURCE_USER = '00000000-0000-4000-8000-000000000111';
const OTHER_USER = '00000000-0000-4000-8000-000000000222';

beforeEach(() => {
  vi.clearAllMocks();
});

function rowDb(row: Record<string, unknown>): DbPort {
  return {
    async query<T>(): Promise<DbQueryResult<T>> {
      return { rows: [row] as T[], rowCount: 1 };
    },
    async tx<T>(fn: (tx: DbPort) => Promise<T>): Promise<T> {
      return fn(rowDb(row));
    },
  };
}

const linkPhone = (db: DbPort): Promise<unknown> =>
  runWithOrganizationPrincipal(ORG, () =>
    createDbWritePort({ db, authChannelPolicy: async () => true }).writeDb({
      type: 'user.phone.link',
      params: {
        resource: 'telegram',
        channelUserId: '778',
        phoneNormalized: '+79000000078',
        correlationId: 'audit-d25',
      },
    }),
  );

describe('D25 audit — user.phone.link external contract', () => {
  it('reports a dropped connection as indeterminate, not as a definite refusal', async () => {
    const transient = Object.assign(new Error('connection terminated unexpectedly'), {
      code: '08006',
    });
    const db: DbPort = {
      async query(): Promise<never> {
        throw transient;
      },
      async tx(): Promise<never> {
        throw transient;
      },
    };

    await expect(linkPhone(db)).resolves.toEqual({
      userPhoneLinkApplied: false,
      phoneLinkIndeterminate: true,
      phoneLinkReason: 'db_transient_failure',
    });
  });

  it('refuses a phone owned by another account neutrally and fail-closed', async () => {
    const result = await linkPhone(
      rowDb({ platform_user_id: SOURCE_USER, applied: false, failure_code: 'phone_owned_by_other_user' }),
    );
    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'phone_owned_by_other_user',
    });
    expect(result).not.toHaveProperty('candidateIds');
    expect(JSON.stringify(result)).not.toContain(OTHER_USER);
  });

  it('leaves one durable manual-review case naming BOTH colliding accounts', async () => {
    await linkPhone(
      rowDb({ platform_user_id: SOURCE_USER, applied: false, failure_code: 'phone_owned_by_other_user' }),
    );
    await vi.waitFor(() => expect(fakes.recordBlocked).toHaveBeenCalledTimes(1));
    const call = fakes.recordBlocked.mock.calls[0]?.[0] as { candidateIds: string[]; reason: string };
    expect(call.reason).toBe('phone_owned_by_other_user');
    expect([...call.candidateIds].sort()).toEqual([SOURCE_USER, OTHER_USER].sort());
  });

  it('refuses an ambiguous merge instead of applying or dropping it', async () => {
    const result = await linkPhone(
      rowDb({
        platform_user_id: SOURCE_USER,
        applied: false,
        failure_code: 'merge_blocked_ambiguous_candidates',
      }),
    );
    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'merge_blocked_ambiguous_candidates',
    });
    await vi.waitFor(() => expect(fakes.recordBlocked).toHaveBeenCalledTimes(1));
  });
});
