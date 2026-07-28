import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDrizzleMock } = vi.hoisted(() => ({
  getDrizzleMock: vi.fn(),
}));
const runDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));

import { createPgClientHistoryPort } from './pgClientHistory';

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPOINTMENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PATIENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COMMENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('pgClientHistory principal-safe appointment comment mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG);
  });

  it('creates appointment staff comments through runDrizzleMutationTransaction', async () => {
    const returning = vi.fn(async () => [
      {
        id: COMMENT,
        organizationId: ORG,
        appointmentId: APPOINTMENT,
        platformUserId: PATIENT,
        authorId: DOCTOR,
        body: 'Follow up',
        createdAt: '2026-07-09T00:00:00.000Z',
        updatedAt: '2026-07-09T00:00:00.000Z',
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    runDrizzleMutationTransactionMock.mockImplementation(
      (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const port = createPgClientHistoryPort();
    const row = await port.createAppointmentComment({
      organizationId: ORG,
      appointmentId: APPOINTMENT,
      platformUserId: PATIENT,
      authorId: DOCTOR,
      body: 'Follow up',
    });

    expect(row).toEqual({
      id: COMMENT,
      appointmentId: APPOINTMENT,
      platformUserId: PATIENT,
      authorId: DOCTOR,
      body: 'Follow up',
      createdAt: '2026-07-09T00:00:00.000Z',
      updatedAt: '2026-07-09T00:00:00.000Z',
    });
    expect(runDrizzleMutationTransactionMock).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        appointmentId: APPOINTMENT,
        platformUserId: PATIENT,
        authorId: DOCTOR,
        body: 'Follow up',
      }),
    );
    expect(returning).toHaveBeenCalledTimes(1);
  });

  it('upserts booking profiles through runDrizzleMutationTransaction', async () => {
    const selectLimit = vi.fn(async () => []);
    const selectWhere = vi.fn(() => ({ limit: selectLimit }));
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    const select = vi.fn(() => ({ from: selectFrom }));
    const returning = vi.fn(async () => [
      {
        platformUserId: PATIENT,
        organizationId: ORG,
        isProblematic: true,
        bookingBlocked: false,
        problematicNote: null,
        updatedAt: '2026-07-09T00:00:00.000Z',
        updatedBy: DOCTOR,
      },
    ]);
    const values = vi.fn(() => ({ returning }));
    const insert = vi.fn(() => ({ values }));
    const tx = { insert };
    const db = {
      select,
      insert: vi.fn(() => {
        throw new Error('db insert should not run outside mutation transaction');
      }),
    };
    getDrizzleMock.mockReturnValue(db);
    runDrizzleMutationTransactionMock.mockImplementation(
      (callback: (executor: typeof tx) => Promise<unknown>) => callback(tx),
    );

    const port = createPgClientHistoryPort();
    const row = await port.upsertBookingProfile({
      organizationId: ORG,
      platformUserId: PATIENT,
      isProblematic: true,
      updatedBy: DOCTOR,
    });

    expect(row).toEqual(
      expect.objectContaining({
        organizationId: ORG,
        platformUserId: PATIENT,
        isProblematic: true,
      }),
    );
    expect(runDrizzleMutationTransactionMock).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does not use an untrusted patient phone to expose orphan payment history', async () => {
    let selectCall = 0;
    const select = vi.fn(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return {
          from: () => ({
            where: () => ({
              limit: vi
                .fn()
                .mockResolvedValue([{ phone: '+12025550101', patientPhoneTrustAt: null }]),
            }),
          }),
        };
      }
      if (selectCall === 2) {
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({ limit: vi.fn().mockResolvedValue([]) }),
            }),
          }),
        };
      }
      throw new Error('untrusted_phone_orphan_query_must_not_run');
    });
    getDrizzleMock.mockReturnValue({ select });

    const rows = await createPgClientHistoryPort().listPaymentHistory(ORG, PATIENT, 50);

    expect(rows).toEqual([]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
