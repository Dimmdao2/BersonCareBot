import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());

vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: getDrizzleMock }));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));
vi.mock('@/infra/db/saasIsolationOperationContext', () => ({
  runWithWebappDbOperationFamily: (_family: string, fn: () => unknown) => fn(),
}));
vi.mock('@/infra/db/runWebappSql', () => ({ runWebappPgText: vi.fn() }));

import { createPgPatientOrganizationPort } from './pgPatientOrganization';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('pgPatientOrganization trusted organization enrollment check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed before querying when the trusted organization principal differs', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    await expect(
      createPgPatientOrganizationPort().hasActiveEnrollment(PATIENT_ID, ORG_B),
    ).resolves.toBe(false);
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it('keeps M2M/organization-principal enrollment checks on the exact org query', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const limit = vi.fn().mockResolvedValue([{ organizationId: ORG_A }]);
    const where = vi.fn(() => ({ limit }));
    getDrizzleMock.mockReturnValue({
      select: () => ({ from: () => ({ where }) }),
    });

    await expect(
      createPgPatientOrganizationPort().hasActiveEnrollment(PATIENT_ID, ORG_A),
    ).resolves.toBe(true);
    expect(where).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('allows invited cards for staff scheduling but still denies a foreign organization', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const limit = vi.fn().mockResolvedValue([{ organizationId: ORG_A }]);
    getDrizzleMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
    });

    await expect(
      createPgPatientOrganizationPort().hasSchedulableClientRelationship(PATIENT_ID, ORG_A),
    ).resolves.toBe(true);
    await expect(
      createPgPatientOrganizationPort().hasSchedulableClientRelationship(PATIENT_ID, ORG_B),
    ).resolves.toBe(false);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it('creates a canonical client and invited exact-org enrollment in one transaction', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const selectResults = [[], [], [{ status: 'invited' }]];
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn(async () => selectResults.shift() ?? []),
        }),
      }),
    }));
    let insertIndex = 0;
    const insertValues: unknown[] = [];
    const insert = vi.fn(() => {
      insertIndex += 1;
      const current = insertIndex;
      return {
        values: vi.fn((values: unknown) => {
          insertValues.push(values);
          if (current === 1) {
            return {
              returning: async () => [
                {
                  id: PATIENT_ID,
                  displayName: 'Новый Пациент',
                  lastName: 'Новый',
                  firstName: 'Пациент',
                  patronymic: null,
                },
              ],
            };
          }
          if (current === 2) return Promise.resolve();
          return { onConflictDoNothing: () => Promise.resolve() };
        }),
      };
    });
    const savepoint = vi.fn(async (fn: (value: { insert: typeof insert }) => unknown) =>
      fn({ insert }),
    );
    const tx = { select, insert, transaction: savepoint };
    const transaction = vi.fn(async (fn: (value: typeof tx) => unknown) => fn(tx));
    getDrizzleMock.mockReturnValue({ transaction });

    await expect(
      createPgPatientOrganizationPort().createManualOrganizationClient({
        organizationId: ORG_A,
        phoneNormalized: '+79990000001',
        lastName: 'Новый',
        firstName: 'Пациент',
        patronymic: null,
        emailRaw: null,
        emailNormalized: null,
      }),
    ).resolves.toEqual({
      ok: true,
      userId: PATIENT_ID,
      displayName: 'Новый Пациент',
      lastName: 'Новый',
      firstName: 'Пациент',
      patronymic: null,
      phoneNormalized: '+79990000001',
      created: true,
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(savepoint).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledTimes(3);
    expect(insertValues).toEqual([
      expect.objectContaining({ phoneNormalized: '+79990000001', role: 'client' }),
      expect.objectContaining({
        platformUserId: PATIENT_ID,
        organizationId: ORG_A,
        source: 'admin',
      }),
      expect.objectContaining({
        platformUserId: PATIENT_ID,
        organizationId: ORG_A,
        status: 'invited',
      }),
    ]);
  });

  it('fails closed before a transaction when the writer organization differs from the principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    await expect(
      createPgPatientOrganizationPort().createManualOrganizationClient({
        organizationId: ORG_B,
        phoneNormalized: '+79990000001',
        lastName: 'Чужой',
        firstName: 'Пациент',
        patronymic: null,
        emailRaw: null,
        emailNormalized: null,
      }),
    ).rejects.toThrow('organization_principal_mismatch');
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });
});
