import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn<() => string | undefined>());
const runDrizzleMutationTransactionMock = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    and: (...conditions: unknown[]) => ({ kind: 'and', conditions }),
    asc: (column: unknown) => ({ kind: 'asc', column }),
    eq: (column: unknown, value: unknown) => ({ kind: 'eq', column, value }),
  };
});

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: getDrizzleMock,
}));

vi.mock('@/infra/db/drizzleMutationTx', () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));

import { createPgPatientComorbiditiesPort } from './pgPatientComorbidities';

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';
const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const DOCTOR_ID = '00000000-0000-4000-8000-00000000000d';
const COMORBIDITY_ID = '00000000-0000-4000-8000-0000000000cc';

const dbRow = {
  id: COMORBIDITY_ID,
  organizationId: ORG_A,
  patientUserId: PATIENT_ID,
  text: 'Астма',
  since: 'с 2018',
  status: 'active',
  createdBy: DOCTOR_ID,
  createdAt: '2026-07-01T00:00:00.000Z',
  removedAt: null,
};

type AndCondition = {
  conditions: Array<{ value?: unknown }>;
};

function isAndCondition(value: unknown): value is AndCondition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'conditions' in value &&
    Array.isArray((value as { conditions?: unknown }).conditions)
  );
}

describe('pgPatientComorbidities', () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    runDrizzleMutationTransactionMock.mockReset();
  });

  it('listByPatient requires an organization principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(
      createPgPatientComorbiditiesPort().listByPatient(PATIENT_ID, 'active'),
    ).rejects.toThrow('organization_principal_required');
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it('listByPatient filters by current organization principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const capturedConditions: unknown[] = [];
    const whereMock = vi.fn((condition: unknown) => {
      capturedConditions.push(condition);
      return {
        orderBy: vi.fn().mockResolvedValue([dbRow]),
      };
    });
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: whereMock,
        }),
      }),
    });

    const list = await createPgPatientComorbiditiesPort().listByPatient(PATIENT_ID, 'active');

    expect(list).toEqual([
      {
        id: COMORBIDITY_ID,
        text: 'Астма',
        since: 'с 2018',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        removedAt: null,
      },
    ]);
    const condition = capturedConditions[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c: { value?: unknown }) => c.value)).toContain(ORG_A);
    }
  });

  it('add requires an organization principal before opening a mutation transaction', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(
      createPgPatientComorbiditiesPort().add({
        patientUserId: PATIENT_ID,
        text: 'Астма',
        createdBy: DOCTOR_ID,
      }),
    ).rejects.toThrow('organization_principal_required');
    expect(runDrizzleMutationTransactionMock).not.toHaveBeenCalled();
  });

  it('add stamps current organization principal in the mutation transaction', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const valuesMock = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([dbRow]),
    }));
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        insert: () => ({
          values: valuesMock,
        }),
      }),
    );

    const row = await createPgPatientComorbiditiesPort().add({
      patientUserId: PATIENT_ID,
      text: 'Астма',
      since: 'с 2018',
      createdBy: DOCTOR_ID,
    });

    expect(row.id).toBe(COMORBIDITY_ID);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        patientUserId: PATIENT_ID,
        text: 'Астма',
        createdBy: DOCTOR_ID,
      }),
    );
  });

  it('edit rejects existing rows from another organization principal before update', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ organizationId: ORG_B }]),
            }),
          }),
        }),
      }),
    );

    await expect(
      createPgPatientComorbiditiesPort().editText({
        patientUserId: PATIENT_ID,
        comorbidityId: COMORBIDITY_ID,
        text: 'Другая запись',
      }),
    ).rejects.toThrow('organization_principal_mismatch');
  });
});
