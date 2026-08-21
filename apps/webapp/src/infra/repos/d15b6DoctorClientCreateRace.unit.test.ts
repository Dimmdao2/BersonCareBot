/**
 * D15b/6 audit MF-1 (0380): doctor client create must recover from user_contacts phone
 * unique violation during canonical contact insert, not surface create_failed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncContactsMirrorMock = vi.hoisted(() => vi.fn());
const syncFioMirrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/repos/userContactsSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userContactsSql')>();
  return {
    ...actual,
    mutateCanonicalUserContactsWebapp: syncContactsMirrorMock,
  };
});

vi.mock('@/infra/repos/userIdentityFioSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/repos/userIdentityFioSql')>();
  return {
    ...actual,
    syncUserIdentityFioMirrorWebapp: syncFioMirrorMock,
  };
});

import {
  DoctorClientIdentityError,
  resolveOrCreateDoctorClientByPhoneInTransaction,
} from '@/infra/repos/pgDoctorClientCreate';

const ORG_ID = '00000000-0000-4000-8000-0000000e0001';
const PHONE = '+79001234567';
const CONCURRENT_ID = '00000000-0000-4000-8000-0000000d0002';
const NEW_ID = '00000000-0000-4000-8000-0000000d0003';

const phoneUniqueViolation = Object.assign(new Error('duplicate phone in user_contacts'), {
  code: '23505',
  constraint: 'uq_user_contacts_phone',
});

function buildSelectChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.from = vi.fn(self);
  chain.leftJoin = vi.fn(self);
  chain.where = vi.fn(self);
  chain.limit = vi.fn(async () => result);
  chain.select = vi.fn(self);
  return chain;
}

function buildInsertChain(result: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.values = vi.fn(self);
  chain.returning = vi.fn(async () => result);
  chain.insert = vi.fn(self);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  syncFioMirrorMock.mockResolvedValue(undefined);
});

describe('D15b/6 MF-1 — doctor client create user_contacts race recovery', () => {
  it('canonical contact 23505 after insert → links existing client instead of create_failed', async () => {
    let selectPass = 0;
    const selectChain = buildSelectChain([]);
    selectChain.limit = vi.fn(async () => {
      selectPass += 1;
      if (selectPass === 1) return [];
      return [
        {
          id: CONCURRENT_ID,
          role: 'client',
          displayName: 'Иванов Иван',
          lastName: 'Иванов',
          firstName: 'Иван',
          patronymic: null,
          phoneNormalized: PHONE,
        },
      ];
    });

    const insertChain = buildInsertChain([
      {
        id: NEW_ID,
        displayName: 'Петров Пётр',
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
      },
    ]);

    syncContactsMirrorMock.mockRejectedValueOnce(phoneUniqueViolation);

    const savepointTx = {
      insert: vi.fn(() => insertChain),
    };
    const tx = {
      select: vi.fn(() => selectChain),
      transaction: vi.fn(async (fn: (inner: typeof savepointTx) => Promise<unknown>) =>
        fn(savepointTx),
      ),
    };

    const result = await resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, {
      phoneNormalized: PHONE,
      lastName: 'Петров',
      firstName: 'Пётр',
      patronymic: null,
      emailRaw: null,
      emailNormalized: null,
    });

    expect(result).toEqual({
      userId: CONCURRENT_ID,
      displayName: 'Иванов Иван',
      lastName: 'Иванов',
      firstName: 'Иван',
      patronymic: null,
      phoneNormalized: PHONE,
      created: false,
    });
    expect(syncContactsMirrorMock).toHaveBeenCalledWith(savepointTx, NEW_ID, [
      expect.objectContaining({
        action: 'upsert', kind: 'phone', valueNormalized: PHONE, isPrimary: true,
      }),
    ]);
    expect(selectChain.limit).toHaveBeenCalledTimes(2);
  });

  it('canonical contact 23505 with no concurrent owner rethrows (not create_failed)', async () => {
    const selectChain = buildSelectChain([]);
    const insertChain = buildInsertChain([
      {
        id: NEW_ID,
        displayName: 'Петров Пётр',
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
      },
    ]);
    syncContactsMirrorMock.mockRejectedValueOnce(phoneUniqueViolation);

    const savepointTx = { insert: vi.fn(() => insertChain) };
    const tx = {
      select: vi.fn(() => selectChain),
      transaction: vi.fn(async (fn: (inner: typeof savepointTx) => Promise<unknown>) =>
        fn(savepointTx),
      ),
    };

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, {
        phoneNormalized: PHONE,
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
        emailRaw: null,
        emailNormalized: null,
      }),
    ).rejects.toEqual(phoneUniqueViolation);
  });

  it('non-phone errors from mirror still propagate', async () => {
    const selectChain = buildSelectChain([]);
    const insertChain = buildInsertChain([
      {
        id: NEW_ID,
        displayName: 'Петров Пётр',
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
      },
    ]);
    const otherError = new Error('canonical write failed');
    syncContactsMirrorMock.mockRejectedValueOnce(otherError);

    const savepointTx = { insert: vi.fn(() => insertChain) };
    const tx = {
      select: vi.fn(() => selectChain),
      transaction: vi.fn(async (fn: (inner: typeof savepointTx) => Promise<unknown>) =>
        fn(savepointTx),
      ),
    };

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, {
        phoneNormalized: PHONE,
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
        emailRaw: null,
        emailNormalized: null,
      }),
    ).rejects.toThrow('canonical write failed');
  });

  it('identity_conflict when concurrent owner is not a client', async () => {
    let selectPass = 0;
    const selectChain = buildSelectChain([]);
    selectChain.limit = vi.fn(async () => {
      selectPass += 1;
      if (selectPass === 1) return [];
      return [
        {
          id: CONCURRENT_ID,
          role: 'doctor',
          displayName: 'Врач',
          lastName: 'Врач',
          firstName: 'Врач',
          patronymic: null,
          phoneNormalized: PHONE,
        },
      ];
    });
    const insertChain = buildInsertChain([
      {
        id: NEW_ID,
        displayName: 'Петров Пётр',
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
      },
    ]);
    syncContactsMirrorMock.mockRejectedValueOnce(phoneUniqueViolation);

    const savepointTx = { insert: vi.fn(() => insertChain) };
    const tx = {
      select: vi.fn(() => selectChain),
      transaction: vi.fn(async (fn: (inner: typeof savepointTx) => Promise<unknown>) =>
        fn(savepointTx),
      ),
    };

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, {
        phoneNormalized: PHONE,
        lastName: 'Петров',
        firstName: 'Пётр',
        patronymic: null,
        emailRaw: null,
        emailNormalized: null,
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof DoctorClientIdentityError && err.code === 'identity_conflict',
    );
  });
});
