import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetInMemoryPatientFilesForTest,
  __setNextDeleteFileStorageFailureForTest,
  inMemoryPatientFilesPort,
} from './inMemoryPatientFiles';

describe('in-memory patient files deletion', () => {
  beforeEach(() => {
    __resetInMemoryPatientFilesForTest();
  });

  it('removes the canonical row and releases its counted bytes', async () => {
    const file = await inMemoryPatientFilesPort.createFile({
      patientUserId: '22222222-2222-4222-8222-222222222222',
      category: 'анализ',
      fileName: 'result.pdf',
      s3Key: 'patient-files/result.pdf',
      s3Bucket: 'private',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      uploadedByUserId: '33333333-3333-4333-8333-333333333333',
      folderId: '44444444-4444-4444-8444-444444444444',
    });

    expect(await inMemoryPatientFilesPort.getStorageUsedBytes()).toBe(4096);
    await expect(inMemoryPatientFilesPort.deleteFile(file.id)).resolves.toEqual({
      status: 'deleted',
    });
    await expect(inMemoryPatientFilesPort.getFile(file.id)).resolves.toBeNull();
    await expect(inMemoryPatientFilesPort.getStorageUsedBytes()).resolves.toBe(0);
  });

  it('returns not_found for an unknown id', async () => {
    await expect(inMemoryPatientFilesPort.deleteFile('missing-id')).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('keeps the row and reports the failure when the storage delete fails', async () => {
    const file = await inMemoryPatientFilesPort.createFile({
      patientUserId: '22222222-2222-4222-8222-222222222222',
      category: 'анализ',
      fileName: 'result.pdf',
      s3Key: 'patient-files/result.pdf',
      s3Bucket: 'private',
      mimeType: 'application/pdf',
      sizeBytes: 4096,
      uploadedByUserId: '33333333-3333-4333-8333-333333333333',
    });

    __setNextDeleteFileStorageFailureForTest(true);
    await expect(inMemoryPatientFilesPort.deleteFile(file.id)).resolves.toEqual({
      status: 'storage_delete_failed',
    });
    await expect(inMemoryPatientFilesPort.getFile(file.id)).resolves.not.toBeNull();
    await expect(inMemoryPatientFilesPort.getStorageUsedBytes()).resolves.toBe(4096);
  });
});
