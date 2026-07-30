import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetInMemoryPatientFilesForTest,
  inMemoryPatientFilesPort,
} from '@/infra/repos/inMemoryPatientFiles';
import { PATIENT_FILE_STORAGE_LIMIT_EXCEEDED } from './service';

const createParams = {
  patientUserId: '11111111-1111-4111-8111-111111111111',
  category: 'анализ' as const,
  fileName: 'result.pdf',
  s3Key: 'patient-files/result.pdf',
  s3Bucket: 'private',
  mimeType: 'application/pdf',
  uploadedByUserId: '22222222-2222-4222-8222-222222222222',
  storageLimitBytes: 10,
};

describe('patient-file storage limit', () => {
  beforeEach(__resetInMemoryPatientFilesForTest);

  it('accepts an upload through the configured ceiling and refuses the next byte', async () => {
    await expect(
      inMemoryPatientFilesPort.createFile({ ...createParams, sizeBytes: 10 }),
    ).resolves.toMatchObject({ sizeBytes: 10 });
    await expect(
      inMemoryPatientFilesPort.createFile({ ...createParams, fileName: 'next.pdf', sizeBytes: 1 }),
    ).rejects.toThrow(PATIENT_FILE_STORAGE_LIMIT_EXCEEDED);
  });
});
