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

import { createPgPatientFilesPort } from './pgPatientFiles';

const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '20000000-0000-4000-8000-000000000002';
const PATIENT_ID = '00000000-0000-4000-8000-000000000001';
const DOCTOR_ID = '00000000-0000-4000-8000-00000000000d';
const FILE_ID = '00000000-0000-4000-8000-0000000000f1';
const VISIT_ID = '00000000-0000-4000-8000-0000000000a1';
const MEDIA_ID = '00000000-0000-4000-8000-0000000000aa';
const FOLDER_ID = '00000000-0000-4000-8000-0000000000ff';

const dbRow = {
  id: FILE_ID,
  organizationId: ORG_A,
  patientUserId: PATIENT_ID,
  category: 'анализ',
  fileName: 'blood.pdf',
  s3Key: 'patient-files/file-1/blood.pdf',
  s3Bucket: 'bucket',
  mimeType: 'application/pdf',
  sizeBytes: 123,
  visitId: null,
  mediaFileId: MEDIA_ID,
  uploadedByUserId: DOCTOR_ID,
  createdAt: '2026-07-01T00:00:00.000Z',
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

describe('pgPatientFiles principal scoping', () => {
  beforeEach(() => {
    getDrizzleMock.mockReset();
    getCurrentDbPrincipalOrganizationIdMock.mockReset();
    runDrizzleMutationTransactionMock.mockReset();
  });

  it('listFiles requires an organization principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(undefined);

    await expect(createPgPatientFilesPort().listFiles(PATIENT_ID)).rejects.toThrow(
      'organization_principal_required',
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it('listFiles filters by current organization principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const capturedConditions: unknown[] = [];
    const whereMock = vi.fn((condition: unknown) => {
      capturedConditions.push(condition);
      return { orderBy: vi.fn().mockResolvedValue([dbRow]) };
    });
    getDrizzleMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: whereMock,
        }),
      }),
    });

    const list = await createPgPatientFilesPort().listFiles(PATIENT_ID, 'анализ');

    expect(list).toHaveLength(1);
    const condition = capturedConditions[0];
    expect(isAndCondition(condition)).toBe(true);
    if (isAndCondition(condition)) {
      expect(condition.conditions.map((c: { value?: unknown }) => c.value)).toEqual(
        expect.arrayContaining([PATIENT_ID, ORG_A, 'анализ']),
      );
    }
  });

  it('createFile stamps media_files and patient_files with current organization principal', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    const mediaValues = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ id: MEDIA_ID }]),
    }));
    const patientValues = vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([dbRow]),
    }));
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({ values: mediaValues })
      .mockReturnValueOnce({ values: patientValues });
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({ insert: insertMock }),
    );

    const row = await createPgPatientFilesPort().createFile({
      patientUserId: PATIENT_ID,
      category: 'анализ',
      fileName: 'blood.pdf',
      s3Key: 'patient-files/file-1/blood.pdf',
      s3Bucket: 'bucket',
      mimeType: 'application/pdf',
      sizeBytes: 123,
      uploadedByUserId: DOCTOR_ID,
      folderId: FOLDER_ID,
    });

    expect(row.id).toBe(FILE_ID);
    expect(mediaValues).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A, folderId: FOLDER_ID }),
    );
    expect(patientValues).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A, mediaFileId: MEDIA_ID }),
    );
  });

  it('linkFileToVisit rejects a visit from another organization before update', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ organizationId: ORG_A, patientUserId: PATIENT_ID }]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ organizationId: ORG_B, patientUserId: PATIENT_ID }]),
              }),
            }),
          }),
      }),
    );

    await expect(createPgPatientFilesPort().linkFileToVisit(FILE_ID, VISIT_ID)).rejects.toThrow(
      'organization_principal_mismatch',
    );
  });

  it('linkFileToVisit rejects a visit for another patient before update', async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_A);
    runDrizzleMutationTransactionMock.mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        select: vi
          .fn()
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ organizationId: ORG_A, patientUserId: PATIENT_ID }]),
              }),
            }),
          })
          .mockReturnValueOnce({
            from: () => ({
              where: () => ({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ organizationId: ORG_A, patientUserId: DOCTOR_ID }]),
              }),
            }),
          }),
      }),
    );

    await expect(createPgPatientFilesPort().linkFileToVisit(FILE_ID, VISIT_ID)).rejects.toThrow(
      'patient_file_visit_patient_mismatch',
    );
  });
});
