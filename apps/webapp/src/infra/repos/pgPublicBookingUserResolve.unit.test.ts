/**
 * D15b/6: public booking phone resolve reads user_contacts and dual-writes mirrors on create.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleOrMutationTxMock = vi.hoisted(() => vi.fn());
const syncFioMirrorMock = vi.hoisted(() => vi.fn());
const syncContactsMirrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  getDrizzleOrMutationTx: getDrizzleOrMutationTxMock,
}));

vi.mock('@/infra/repos/userIdentityFioSql', () => ({
  syncUserIdentityFioMirrorWebapp: syncFioMirrorMock,
}));

vi.mock('@/infra/repos/userContactsSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userContactsSql')>();
  return {
    ...actual,
    syncUserContactsMirrorWebapp: syncContactsMirrorMock,
  };
});

import { resolveOrCreateTrustedPatientUserByPhone } from '@/infra/repos/pgPublicBookingUserResolve';

const NEW_USER_ID = '00000000-0000-4000-8000-0000000d0b01';
const PHONE = '+79007654321';

beforeEach(() => {
  vi.clearAllMocks();
  syncFioMirrorMock.mockResolvedValue(undefined);
  syncContactsMirrorMock.mockResolvedValue(undefined);
});

describe('resolveOrCreateTrustedPatientUserByPhone — D15b/6', () => {
  it('looks up existing user via drizzlePrimaryPhoneCol, not platform_users.phone_normalized only', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: NEW_USER_ID }]),
        }),
      }),
    });
    getDrizzleOrMutationTxMock.mockReturnValue({ select: selectMock });

    const result = await resolveOrCreateTrustedPatientUserByPhone(PHONE, 'Иван', true);

    expect(result).toEqual({ userId: NEW_USER_ID, created: false });
    expect(selectMock).toHaveBeenCalledWith({ id: expect.anything() });
    expect(syncContactsMirrorMock).not.toHaveBeenCalled();
  });

  it('dual-writes FIO and user_contacts mirrors after creating a new user', async () => {
    const selectMock = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: NEW_USER_ID }]),
      }),
    });
    const db = { select: selectMock, insert: insertMock };
    getDrizzleOrMutationTxMock.mockReturnValue(db);

    const result = await resolveOrCreateTrustedPatientUserByPhone(PHONE, 'Иван', true);

    expect(result).toEqual({ userId: NEW_USER_ID, created: true });
    expect(syncFioMirrorMock).toHaveBeenCalledWith(db, NEW_USER_ID);
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(db, NEW_USER_ID);
  });
});
