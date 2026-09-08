import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  abortPending: vi.fn(),
  confirmFileUpload: vi.fn(),
  enqueue: vi.fn(),
  getFile: vi.fn(),
  getIdentity: vi.fn(),
  getMediaRow: vi.fn(),
  getConfigBool: vi.fn(),
  requireEntitlement: vi.fn(),
  requireWorkspace: vi.fn(),
  validateReceived: vi.fn(),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    doctorClientsPort: { getClientIdentityForOrganization: fakes.getIdentity },
    patientFiles: { getFile: fakes.getFile, confirmFileUpload: fakes.confirmFileUpload },
  }),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireWorkspace,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlement,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: <T>(_context: unknown, operation: () => T): T => operation(),
}));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  abortPendingMediaUpload: fakes.abortPending,
  getMediaRowForConfirm: fakes.getMediaRow,
}));
vi.mock('@/app-layer/media/mediaUploadAdapter', () => ({
  abortPendingMediaUpload: fakes.abortPending,
  validateReceivedMediaObject: fakes.validateReceived,
}));
vi.mock('@/app-layer/media/mediaTranscodeJobs', () => ({
  enqueueMediaTranscodeJob: fakes.enqueue,
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigBool: fakes.getConfigBool,
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { POST } from './route';

const doctorId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const fileId = '33333333-3333-4333-8333-333333333333';
const mediaId = '44444444-4444-4444-8444-444444444444';
const workspace = {
  organizationId: '55555555-5555-4555-8555-555555555555',
  session: { user: { userId: doctorId } },
};

async function confirm() {
  return POST(new Request('https://app.test/confirm', { method: 'POST' }), {
    params: Promise.resolve({ userId: patientId, fileId }),
  });
}

function received(mimeType: string) {
  return { ok: true as const, value: { intent: { mimeType } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireWorkspace.mockResolvedValue({ ok: true, ctx: workspace });
  fakes.requireEntitlement.mockResolvedValue({ ok: true });
  fakes.getIdentity.mockResolvedValue({ userId: patientId });
  fakes.getFile.mockResolvedValue({
    id: fileId,
    patientUserId: patientId,
    mediaFileId: mediaId,
    fileName: 'recording.webm',
  });
  fakes.getMediaRow.mockResolvedValue({
    s3_key: `patient-files/${mediaId}/recording.webm`,
    status: 'pending',
    mime_type: 'video/webm',
    size_bytes: 4,
    storage_target: 'patient',
  });
  fakes.validateReceived.mockResolvedValue(received('video/webm'));
  fakes.confirmFileUpload.mockResolvedValue({ id: fileId });
  fakes.getConfigBool.mockResolvedValue(true);
  fakes.enqueue.mockResolvedValue({ ok: true, kind: 'queued', jobId: 'job-1', alreadyQueued: false });
});

describe('patient file confirmation video processing', () => {
  it('puts a confirmed supported WebM into the existing video queue exactly once', async () => {
    const response = await confirm();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fakes.enqueue).toHaveBeenCalledOnce();
    expect(fakes.enqueue).toHaveBeenCalledWith(mediaId);
  });

  it('never enqueues an object whose received validation failed', async () => {
    fakes.validateReceived.mockResolvedValue({
      ok: false,
      error: 'file_signature_mismatch',
      mime: 'video/webm',
      value: { intent: { mimeType: 'video/webm' } },
    });

    const response = await confirm();

    expect(response.status).toBe(415);
    expect(fakes.confirmFileUpload).not.toHaveBeenCalled();
    expect(fakes.enqueue).not.toHaveBeenCalled();
  });

  it('does not send a confirmed non-video file into the video queue', async () => {
    fakes.getFile.mockResolvedValue({
      id: fileId,
      patientUserId: patientId,
      mediaFileId: mediaId,
      fileName: 'report.pdf',
    });
    fakes.getMediaRow.mockResolvedValue({
      s3_key: `patient-files/${mediaId}/report.pdf`,
      status: 'pending',
      mime_type: 'application/pdf',
      size_bytes: 4,
      storage_target: 'patient',
    });
    fakes.validateReceived.mockResolvedValue(received('application/pdf'));

    const response = await confirm();

    expect(response.status).toBe(200);
    expect(fakes.enqueue).not.toHaveBeenCalled();
  });

  it('keeps an already confirmed upload successful when enqueue configuration fails', async () => {
    fakes.getConfigBool.mockRejectedValueOnce(new Error('settings unavailable'));

    const response = await confirm();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(fakes.confirmFileUpload).toHaveBeenCalledOnce();
  });

  it('does not create a second active job when confirmation loses its race', async () => {
    fakes.confirmFileUpload.mockResolvedValueOnce({ id: fileId }).mockResolvedValueOnce(null);

    const first = await confirm();
    const second = await confirm();

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(fakes.enqueue).toHaveBeenCalledOnce();
  });
});
