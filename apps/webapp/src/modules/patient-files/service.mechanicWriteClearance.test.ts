import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createPatientFilesService } from './service';
import type { PatientFilesPort } from './ports';

const PATIENT_USER_ID = '22222222-2222-4222-8222-222222222222';

function buildService() {
  const createFile = vi.fn(async () => ({
    id: 'file-1',
    patientUserId: PATIENT_USER_ID,
    category: 'прочее' as const,
    fileName: 'scan.pdf',
    s3Key: 'patient-files/scan.pdf',
    s3Bucket: 'bucket',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    uploadedByUserId: 'doctor-1',
    visitId: null,
    mediaFileId: null,
    createdAt: new Date().toISOString(),
  }));
  const patientFilesPort = {
    listFiles: vi.fn(async () => []),
    getFile: vi.fn(async () => null),
    createFile,
    confirmFileUpload: vi.fn(),
    linkFileToVisit: vi.fn(),
    renameFile: vi.fn(),
    deleteFile: vi.fn(),
    getStorageUsedBytes: vi.fn(async () => 0),
  } satisfies PatientFilesPort;
  const service = createPatientFilesService({
    patientFilesPort,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, createFile };
}

describe('patient-files service — 3.2 physical door (files)', () => {
  it('refuses createFile when no files mutation decision ran first', async () => {
    const { service, createFile } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.createFile({
          patientUserId: PATIENT_USER_ID,
          category: 'прочее',
          fileName: 'scan.pdf',
          s3Key: 'patient-files/scan.pdf',
          s3Bucket: 'bucket',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedByUserId: 'doctor-1',
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(createFile).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared files for this continuation', async () => {
    const { service, createFile } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('files');
      const file = await service.createFile({
        patientUserId: PATIENT_USER_ID,
        category: 'прочее',
        fileName: 'scan.pdf',
        s3Key: 'patient-files/scan.pdf',
        s3Bucket: 'bucket',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedByUserId: 'doctor-1',
      });
      expect(file.id).toBe('file-1');
    });
    expect(createFile).toHaveBeenCalledOnce();
  });
});
