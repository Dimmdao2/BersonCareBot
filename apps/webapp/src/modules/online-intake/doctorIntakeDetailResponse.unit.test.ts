import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntakeRequestFullWithPatientIdentity } from './types';

const mocks = vi.hoisted(() => ({
  presign: vi.fn(),
  ttl: vi.fn(),
  logError: vi.fn(),
  env: {
    S3_ENDPOINT: 'https://storage.test',
    S3_PRIVATE_BUCKET: 'private',
    S3_ACCESS_KEY: 'access',
    S3_SECRET_KEY: 'secret',
  },
}));

vi.mock('@/config/env', () => ({
  env: mocks.env,
  isS3MediaEnabled: (env: typeof mocks.env) =>
    Boolean(env.S3_ENDPOINT && env.S3_PRIVATE_BUCKET && env.S3_ACCESS_KEY && env.S3_SECRET_KEY),
}));
vi.mock('@/app-layer/media/s3Client', () => ({ presignGetUrl: mocks.presign }));
vi.mock('@/app-layer/media/videoPresignTtl', () => ({ getVideoPresignTtlSeconds: mocks.ttl }));
vi.mock('@/infra/logging/serverRuntimeLog', () => ({ logServerRuntimeError: mocks.logError }));

import { buildDoctorOnlineIntakeDetailResponse } from './doctorIntakeDetailResponse';

function lfkRequest(): IntakeRequestFullWithPatientIdentity {
  return {
    id: 'request-1',
    userId: 'patient-1',
    type: 'lfk',
    status: 'new',
    summary: 'summary',
    patientName: 'Пациент',
    patientPhone: '+70000000000',
    lastName: '',
    firstName: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    answers: [],
    attachments: [
      {
        id: 'file-1',
        requestId: 'request-1',
        attachmentType: 'file',
        s3Key: 'media/request-1/file.pdf',
        url: null,
        mimeType: 'application/pdf',
        sizeBytes: 12,
        originalName: 'file.pdf',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    statusHistory: [],
  };
}

describe('buildDoctorOnlineIntakeDetailResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.S3_ENDPOINT = 'https://storage.test';
    mocks.env.S3_PRIVATE_BUCKET = 'private';
    mocks.env.S3_ACCESS_KEY = 'access';
    mocks.env.S3_SECRET_KEY = 'secret';
    mocks.ttl.mockResolvedValue(900);
    mocks.presign.mockResolvedValue('https://storage.test/private/signed');
  });

  it('presigns an intake attachment only through configured private S3 and its TTL', async () => {
    const response = await buildDoctorOnlineIntakeDetailResponse(lfkRequest());

    expect(response.attachmentFiles?.[0]?.url).toBe('https://storage.test/private/signed');
    expect(mocks.presign).toHaveBeenCalledWith('media/request-1/file.pdf', 900);
  });

  it('keeps the legacy misconfigured response empty instead of minting a public S3 URL', async () => {
    mocks.env.S3_PRIVATE_BUCKET = '';
    const response = await buildDoctorOnlineIntakeDetailResponse(lfkRequest());

    expect(response.attachmentFiles?.[0]?.url).toBe('');
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith('online_intake_s3_url', expect.any(Error), {
      keyKind: 'media',
    });
  });
});
