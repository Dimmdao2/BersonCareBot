import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  abortPendingProgramSubmission: vi.fn(),
  abortPrepared: vi.fn(),
  gateSession: vi.fn(),
  inspectObject: vi.fn(),
  requireContext: vi.fn(),
  withPrincipal: vi.fn(),
  withSessionLock: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: {},
  isS3MediaEnabled: () => true,
}));
vi.mock('@/app-layer/db/client', () => ({ getPool: () => ({}) }));
vi.mock('@/app-layer/locks/multipartSessionLock', () => ({
  withMultipartSessionLock: fakes.withSessionLock,
}));
vi.mock('@/app-layer/media/mediaUploadSessionsRepo', () => ({
  abortMultipartPendingTx: vi.fn(),
  gateUploadSessionForPartUrl: fakes.gateSession,
}));
vi.mock('@/app-layer/media/mediaUploadAdapter', () => ({
  abortPendingProgramSubmissionUpload: fakes.abortPendingProgramSubmission,
  abortPreparedMultipartUpload: fakes.abortPrepared,
  inspectReceivedMediaObject: fakes.inspectObject,
}));
vi.mock('@/app-layer/guards/mediaMultipartApiContext', () => ({
  requireMediaMultipartApiContext: fakes.requireContext,
  withMediaMultipartPrincipal: fakes.withPrincipal,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: vi.fn(),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { warn: vi.fn() } }));

import { POST } from './route';

const sessionId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const organizationId = '33333333-3333-4333-8333-333333333333';
const mediaId = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireContext.mockResolvedValue({ ok: true, ctx: { kind: 'patient', userId: patientId } });
  fakes.gateSession.mockResolvedValue({
    ok: true,
    row: {
      media_id: mediaId,
      organization_id: organizationId,
      s3_key: 'patient-submissions/example.webm',
      storage_target: 'patient',
      upload_id: 'multipart-upload-id',
    },
  });
  // CreateMultipartUpload has no completed object to HEAD before abort.
  fakes.inspectObject.mockResolvedValue(null);
  fakes.withPrincipal.mockImplementation(
    async (_context: unknown, _organization: string, _source: string, action: () => Promise<unknown>) =>
      action(),
  );
  fakes.abortPendingProgramSubmission.mockResolvedValue(true);
  fakes.abortPrepared.mockResolvedValue(undefined);
});

describe('patient program-submission multipart abort', () => {
  it('removes the caller-owned pending submission even before multipart has a completed object to inspect', async () => {
    const response = await POST(
      new Request('https://app.test/api/media/multipart/abort', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fakes.abortPendingProgramSubmission).toHaveBeenCalledWith(mediaId);
    expect(fakes.abortPrepared).toHaveBeenCalledWith(
      'patient-submissions/example.webm',
      'multipart-upload-id',
      'patient',
    );
  });
});
