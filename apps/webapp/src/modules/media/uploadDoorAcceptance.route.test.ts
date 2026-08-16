import { beforeEach, describe, expect, it, vi } from 'vitest';

const ids = {
  doctor: '11111111-1111-4111-8111-111111111111',
  patient: '22222222-2222-4222-8222-222222222222',
  foreignPatient: '33333333-3333-4333-8333-333333333333',
  organization: '44444444-4444-4444-8444-444444444444',
  media: '55555555-5555-4555-8555-555555555555',
  file: '66666666-6666-4666-8666-666666666666',
  instance: '77777777-7777-4777-8777-777777777777',
  session: '88888888-8888-4888-8888-888888888888',
  folder: '99999999-9999-4999-8999-999999999999',
} as const;

const fakes = vi.hoisted(() => ({
  requireDoctorWorkspaceApiContext: vi.fn(),
  requirePatientApiBusinessAccess: vi.fn(),
  requireEntitlementForMutation: vi.fn(),
  withDoctorWorkspacePrincipal: vi.fn(),
  withExplicitOrganizationPrincipal: vi.fn(),
  withUserLifecycleLock: vi.fn(),
  withMultipartSessionLock: vi.fn(),
  buildAppDeps: vi.fn(),
  getPool: vi.fn(),
  resolveFileStorageLimit: vi.fn(),
  pgFolderExists: vi.fn(),
  pgValidateUserAssignableMediaFolder: vi.fn(),
  pgEnsureClientPatientFolder: vi.fn(),
  resolveDoctorInstanceInWorkspace: vi.fn(),
  assertPatientProgramMediaAllowed: vi.fn(),
  isPatientProgramDiscussionMediaFlowEnabled: vi.fn(),
  insertPendingMediaFileTx: vi.fn(),
  createPendingProgramSubmissionMediaFile: vi.fn(),
  deletePendingMediaFileById: vi.fn(),
  stagePendingMediaAbort: vi.fn(),
  getMediaRowForConfirm: vi.fn(),
  confirmMediaFileReady: vi.fn(),
  confirmProgramSubmissionMediaFileReady: vi.fn(),
  abortPendingProgramSubmissionMedia: vi.fn(),
  insertUploadSessionTx: vi.fn(),
  claimUploadSessionForCompletingTx: vi.fn(),
  getCompletingSessionTx: vi.fn(),
  classifyMultipartCompleteRejection: vi.fn(),
  markCompletingSessionFailedTx: vi.fn(),
  tryFinalizeMultipartIdempotentTx: vi.fn(),
  presignPutUrl: vi.fn(),
  presignUploadPartUrl: vi.fn(),
  s3CreateMultipartUpload: vi.fn(),
  s3CompleteMultipartUpload: vi.fn(),
  s3AbortMultipartUpload: vi.fn(),
  s3HeadObjectDetails: vi.fn(),
  s3GetObjectPrefix: vi.fn(),
  s3DeleteObject: vi.fn(),
  presignGetUrl: vi.fn(),
  mediaFolderExists: vi.fn(),
  mediaUpload: vi.fn(),
  getClientIdentityForOrganization: vi.fn(),
  listPatientFiles: vi.fn(),
  getPatientFile: vi.fn(),
  createPatientFile: vi.fn(),
  confirmPatientFileUpload: vi.fn(),
  getStorageUsedBytes: vi.fn(),
  maybeAutoEnqueueVideoTranscodeAfterUpload: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { S3_PRIVATE_BUCKET: 'test-private', S3_ENDPOINT: 'http://s3.test' },
  isS3MediaEnabled: () => true,
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireDoctorWorkspaceApiContext: fakes.requireDoctorWorkspaceApiContext,
  requirePatientApiBusinessAccess: fakes.requirePatientApiBusinessAccess,
}));
vi.mock('@/app-layer/guards/requireEntitlement', () => ({
  requireEntitlementForMutation: fakes.requireEntitlementForMutation,
}));
vi.mock('@/app-layer/guards/doctorWorkspacePrincipal', () => ({
  withDoctorWorkspacePrincipal: fakes.withDoctorWorkspacePrincipal,
}));
vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: fakes.withExplicitOrganizationPrincipal,
}));
vi.mock('@/app-layer/locks/userLifecycleLock', () => ({
  withUserLifecycleLock: fakes.withUserLifecycleLock,
}));
vi.mock('@/app-layer/locks/multipartSessionLock', () => ({
  withMultipartSessionLock: fakes.withMultipartSessionLock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/app-layer/db/client', () => ({ getPool: fakes.getPool }));
vi.mock('@/modules/org-entitlements/service', () => ({
  resolveFileStorageLimit: fakes.resolveFileStorageLimit,
}));
vi.mock('@/app-layer/media/mediaFoldersRepo', () => ({ pgFolderExists: fakes.pgFolderExists }));
vi.mock('@/app-layer/media/clientMediaFolders', () => ({
  pgValidateUserAssignableMediaFolder: fakes.pgValidateUserAssignableMediaFolder,
  pgEnsureClientPatientFolder: fakes.pgEnsureClientPatientFolder,
}));
vi.mock('@/app/api/doctor/treatment-program-instances/_doctorInstanceWorkspace', () => ({
  resolveDoctorInstanceInWorkspace: fakes.resolveDoctorInstanceInWorkspace,
}));
vi.mock('@/modules/doctor-clients/assertPatientProgramInteraction', () => ({
  assertPatientProgramMediaAllowed: fakes.assertPatientProgramMediaAllowed,
}));
vi.mock('@/modules/program-item-discussion/discussionFeatureGates', () => ({
  isPatientProgramDiscussionMediaFlowEnabled: fakes.isPatientProgramDiscussionMediaFlowEnabled,
}));
vi.mock('@/app-layer/routes/paths', () => ({ routePaths: { patient: '/app/patient' } }));
vi.mock('@/app-layer/media/s3MediaStorage', () => ({
  insertPendingMediaFileTx: fakes.insertPendingMediaFileTx,
  createPendingProgramSubmissionMediaFile: fakes.createPendingProgramSubmissionMediaFile,
  deletePendingMediaFileById: fakes.deletePendingMediaFileById,
  stagePendingMediaAbort: fakes.stagePendingMediaAbort,
  getMediaRowForConfirm: fakes.getMediaRowForConfirm,
  confirmMediaFileReady: fakes.confirmMediaFileReady,
  confirmProgramSubmissionMediaFileReady: fakes.confirmProgramSubmissionMediaFileReady,
  abortPendingProgramSubmissionMedia: fakes.abortPendingProgramSubmissionMedia,
}));
vi.mock('@/app-layer/media/mediaUploadSessionsRepo', () => ({
  insertUploadSessionTx: fakes.insertUploadSessionTx,
  claimUploadSessionForCompletingTx: fakes.claimUploadSessionForCompletingTx,
  getCompletingSessionTx: fakes.getCompletingSessionTx,
  classifyMultipartCompleteRejection: fakes.classifyMultipartCompleteRejection,
  markCompletingSessionFailedTx: fakes.markCompletingSessionFailedTx,
  tryFinalizeMultipartIdempotentTx: fakes.tryFinalizeMultipartIdempotentTx,
  bumpSessionToUploading: vi.fn(),
  gateUploadSessionForPartUrl: vi.fn(),
}));
vi.mock('@/app-layer/media/s3Client', () => ({
  presignPutUrl: fakes.presignPutUrl,
  presignUploadPartUrl: fakes.presignUploadPartUrl,
  s3CreateMultipartUpload: fakes.s3CreateMultipartUpload,
  s3CompleteMultipartUpload: fakes.s3CompleteMultipartUpload,
  s3AbortMultipartUpload: fakes.s3AbortMultipartUpload,
  s3HeadObjectDetails: fakes.s3HeadObjectDetails,
  s3GetObjectPrefix: fakes.s3GetObjectPrefix,
  s3DeleteObject: fakes.s3DeleteObject,
  presignGetUrl: fakes.presignGetUrl,
  s3ObjectKey: (id: string, filename: string) => `media/${id}/${filename}`,
}));
vi.mock('@/app-layer/media/mediaTranscodeAutoEnqueue', () => ({
  maybeAutoEnqueueVideoTranscodeAfterUpload: fakes.maybeAutoEnqueueVideoTranscodeAfterUpload,
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: fakes.loggerError, warn: fakes.loggerWarn },
}));

import { POST as proxyUpload } from '@/app/api/media/upload/route';
import { POST as genericPresign } from '@/app/api/media/presign/route';
import { POST as multipartInit } from '@/app/api/media/multipart/init/route';
import { POST as genericConfirm } from '@/app/api/media/confirm/route';
import { POST as multipartComplete } from '@/app/api/media/multipart/complete/route';
import { POST as individualPresign } from '@/app/api/doctor/treatment-program-instances/[instanceId]/media-presign/route';
import { POST as submissionPresign } from '@/app/api/patient/media/program-submission/presign/route';
import { POST as submissionConfirm } from '@/app/api/patient/media/program-submission/confirm/route';
import { POST as patientFilePresign } from '@/app/api/doctor/patients/[userId]/files/route';
import { POST as patientFileConfirm } from '@/app/api/doctor/patients/[userId]/files/[fileId]/confirm/route';

const doctorContext = {
  organizationId: ids.organization,
  session: { user: { userId: ids.doctor } },
};

function executeLastCallback(args: unknown[]): unknown {
  const callback = args.at(-1);
  if (typeof callback !== 'function') throw new Error('callback fixture missing');
  return callback();
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test.local/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function proxyRequest(file: File, folderId?: string): Request {
  const form = new FormData();
  form.append('file', file);
  if (folderId) form.append('folderId', folderId);
  return new Request('http://test.local/api/media/upload', { method: 'POST', body: form });
}

function proxyRequestWithParsedForm(file: File, folderId?: string): Request {
  const form = new FormData();
  form.append('file', file);
  if (folderId) form.append('folderId', folderId);
  return {
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=accepted-by-parser' }),
    formData: async () => form,
  } as Request;
}

function jpegFile(name = 'photo.jpg'): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    s3_key: 'uploads/object',
    status: 'pending',
    mime_type: 'image/jpeg',
    original_name: 'photo.jpg',
    usage_purpose: null,
    size_bytes: 3,
    ...overrides,
  };
}

function receivedHead(overrides: Record<string, unknown> = {}) {
  return {
    contentLength: 3,
    contentType: 'image/jpeg',
    metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({ ok: true, ctx: doctorContext });
  fakes.requirePatientApiBusinessAccess.mockResolvedValue({
    ok: true,
    session: { user: { userId: ids.patient } },
  });
  fakes.requireEntitlementForMutation.mockResolvedValue({ ok: true });
  fakes.withDoctorWorkspacePrincipal.mockImplementation((...args: unknown[]) =>
    executeLastCallback(args),
  );
  fakes.withExplicitOrganizationPrincipal.mockImplementation((...args: unknown[]) =>
    executeLastCallback(args),
  );
  fakes.withUserLifecycleLock.mockImplementation((...args: unknown[]) => executeLastCallback(args));
  fakes.withMultipartSessionLock.mockImplementation((...args: unknown[]) =>
    executeLastCallback(args),
  );
  fakes.getPool.mockReturnValue({});
  fakes.resolveFileStorageLimit.mockResolvedValue(null);
  fakes.pgFolderExists.mockResolvedValue(true);
  fakes.pgValidateUserAssignableMediaFolder.mockResolvedValue({ ok: true });
  fakes.pgEnsureClientPatientFolder.mockResolvedValue({ id: ids.folder });
  fakes.resolveDoctorInstanceInWorkspace.mockResolvedValue({
    ok: true,
    instance: { patientUserId: ids.patient },
  });
  fakes.assertPatientProgramMediaAllowed.mockResolvedValue({
    ok: true,
    policy: { organizationId: ids.organization },
  });
  fakes.isPatientProgramDiscussionMediaFlowEnabled.mockResolvedValue(true);
  fakes.presignPutUrl.mockResolvedValue('http://s3.test/upload');
  fakes.presignUploadPartUrl.mockResolvedValue('http://s3.test/part');
  fakes.s3CreateMultipartUpload.mockResolvedValue({ uploadId: 's3-upload' });
  fakes.s3CompleteMultipartUpload.mockResolvedValue(undefined);
  fakes.s3AbortMultipartUpload.mockResolvedValue(undefined);
  fakes.s3HeadObjectDetails.mockResolvedValue(receivedHead());
  fakes.s3GetObjectPrefix.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
  fakes.confirmMediaFileReady.mockResolvedValue(true);
  fakes.confirmProgramSubmissionMediaFileReady.mockResolvedValue(true);
  fakes.createPendingProgramSubmissionMediaFile.mockResolvedValue(true);
  fakes.abortPendingProgramSubmissionMedia.mockResolvedValue(true);
  fakes.stagePendingMediaAbort.mockResolvedValue(true);
  fakes.tryFinalizeMultipartIdempotentTx.mockResolvedValue({
    kind: 'finalized',
    result: { sessionRows: 1, mediaRows: 1 },
  });
  fakes.getClientIdentityForOrganization.mockResolvedValue({ userId: ids.patient });
  fakes.listPatientFiles.mockResolvedValue([]);
  fakes.getPatientFile.mockResolvedValue({
    id: ids.file,
    patientUserId: ids.patient,
    fileName: 'photo.jpg',
    mediaFileId: ids.media,
  });
  fakes.createPatientFile.mockResolvedValue({
    id: ids.file,
    patientUserId: ids.patient,
    fileName: 'photo.jpg',
    mediaFileId: ids.media,
  });
  fakes.confirmPatientFileUpload.mockResolvedValue({
    id: ids.file,
    patientUserId: ids.patient,
    fileName: 'photo.jpg',
    mediaFileId: ids.media,
  });
  fakes.getStorageUsedBytes.mockResolvedValue(0);
  fakes.mediaFolderExists.mockResolvedValue(true);
  fakes.mediaUpload.mockResolvedValue({
    record: { id: ids.media },
    url: `/api/media/${ids.media}`,
  });
  fakes.buildAppDeps.mockReturnValue({
    media: { folderExists: fakes.mediaFolderExists, upload: fakes.mediaUpload },
    doctorClientsPort: {
      getClientIdentityForOrganization: fakes.getClientIdentityForOrganization,
    },
    patientFiles: {
      listFiles: fakes.listPatientFiles,
      getFile: fakes.getPatientFile,
      createFile: fakes.createPatientFile,
      confirmFileUpload: fakes.confirmPatientFileUpload,
      getStorageUsedBytes: fakes.getStorageUsedBytes,
    },
    orgEntitlements: {},
  });
});

describe('Ч1 intent policy at the six public intake routes', () => {
  it('rejects an empty proxy form before any write', async () => {
    const form = new FormData();
    const request = {
      headers: new Headers({ 'content-type': 'multipart/form-data; boundary=accepted-by-parser' }),
      formData: async () => form,
    } as Request;

    const response = await proxyUpload(request);

    expect(response.status).toBe(400);
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['proxy', () => proxyUpload(proxyRequest(new File(['MZ'], 'virus.exe', { type: 'x/x' })))],
    [
      'generic single-PUT',
      () => genericPresign(jsonRequest({ filename: 'virus.exe', mimeType: 'x/x', size: 2 })),
    ],
    [
      'generic multipart',
      () => multipartInit(jsonRequest({ filename: 'virus.exe', mimeType: 'x/x', size: 2 })),
    ],
    [
      'individual exercise',
      () =>
        individualPresign(
          jsonRequest({ filename: 'report.pdf', mimeType: 'application/pdf', size: 5 }),
          { params: Promise.resolve({ instanceId: ids.instance }) },
        ),
    ],
    [
      'patient submission',
      () =>
        submissionPresign(
          jsonRequest({ filename: 'report.pdf', mimeType: 'application/pdf', size: 5 }),
        ),
    ],
    [
      'patient file',
      () =>
        patientFilePresign(
          jsonRequest({
            category: 'прочее',
            fileName: 'virus.exe',
            mimeType: 'x/x',
            sizeBytes: 2,
          }),
          { params: Promise.resolve({ userId: ids.patient }) },
        ),
    ],
  ])('%s rejects its unsupported policy input before write/presign', async (_name, invoke) => {
    const response = await invoke();

    expect(response.status).toBe(415);
    expect(fakes.presignPutUrl).not.toHaveBeenCalled();
    expect(fakes.s3CreateMultipartUpload).not.toHaveBeenCalled();
    expect(fakes.insertPendingMediaFileTx).not.toHaveBeenCalled();
    expect(fakes.createPendingProgramSubmissionMediaFile).not.toHaveBeenCalled();
    expect(fakes.createPatientFile).not.toHaveBeenCalled();
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });

  it('rejects an extension incompatible with an otherwise valid MIME before side effects', async () => {
    const response = await genericPresign(
      jsonRequest({ filename: 'payload.exe', mimeType: 'image/jpeg', size: 3 }),
    );

    expect(response.status).toBe(415);
    expect(fakes.insertPendingMediaFileTx).not.toHaveBeenCalled();
    expect(fakes.presignPutUrl).not.toHaveBeenCalled();
  });

  it('patient submission presign creates the exact pending record before issuing the upload URL', async () => {
    const response = await submissionPresign(
      jsonRequest({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 3 }),
    );

    expect(response.status).toBe(200);
    expect(fakes.createPendingProgramSubmissionMediaFile).toHaveBeenCalledOnce();
    expect(fakes.createPendingProgramSubmissionMediaFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 3,
      }),
    );
    expect(fakes.presignPutUrl).toHaveBeenCalledOnce();
  });

  it('patient video confirm atomically makes the submission ready and queues processing', async () => {
    fakes.getMediaRowForConfirm.mockResolvedValue(
      pendingRow({
        original_name: 'clip.mp4',
        mime_type: 'video/mp4',
        size_bytes: 12,
        usage_purpose: 'program_item_submission',
      }),
    );
    fakes.s3HeadObjectDetails.mockResolvedValue(
      receivedHead({ contentLength: 12, contentType: 'video/mp4' }),
    );
    fakes.s3GetObjectPrefix.mockResolvedValue(
      Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      ]),
    );

    const response = await submissionConfirm(jsonRequest({ mediaId: ids.media }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({ ok: true, mediaId: ids.media, processing: true }),
    );
    expect(fakes.confirmProgramSubmissionMediaFileReady).toHaveBeenCalledOnce();
  });

  it('does not replace an empty proxy filename with a valid synthetic filename', async () => {
    const response = await proxyUpload(proxyRequestWithParsedForm(jpegFile('')));

    expect(response.status).toBe(400);
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });

  it('rejects invalid proxy bytes before consulting the requested folder', async () => {
    const response = await proxyUpload(
      proxyRequestWithParsedForm(new File(['MZ'], 'virus.exe', { type: 'x/x' }), ids.folder),
    );

    expect(response.status).toBe(415);
    expect(fakes.mediaFolderExists).not.toHaveBeenCalled();
    expect(fakes.pgValidateUserAssignableMediaFolder).not.toHaveBeenCalled();
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });

  it('does not write proxy bytes whose signature mismatches an allowed MIME', async () => {
    const response = await proxyUpload(
      proxyRequestWithParsedForm(
        new File([new Uint8Array([0x25, 0x50, 0x44])], 'photo.jpg', { type: 'image/jpeg' }),
      ),
    );

    expect(response.status).toBe(415);
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });

  it('keeps the proxy 50 MiB cap before reading or writing the body', async () => {
    const file = jpegFile();
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    const response = await proxyUpload(proxyRequestWithParsedForm(file));

    expect(response.status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(fakes.mediaUpload).not.toHaveBeenCalled();
  });
});

describe('Ч1 received object at real confirm handlers', () => {
  it.each([
    [
      'declared one byte but HEAD is larger',
      receivedHead({ contentLength: 3 }),
      Buffer.from([0xff, 0xd8, 0xff]),
      1,
      413,
    ],
    [
      'stored Content-Type changed',
      receivedHead({ contentType: 'application/pdf' }),
      Buffer.from([0xff, 0xd8, 0xff]),
      3,
      415,
    ],
    ['signature is incompatible', receivedHead(), Buffer.from([0x25, 0x50, 0x44]), 3, 415],
  ])('generic confirm rejects %s before ready', async (_name, head, prefix, declared, status) => {
    fakes.getMediaRowForConfirm.mockResolvedValue(pendingRow({ size_bytes: declared }));
    fakes.s3HeadObjectDetails.mockResolvedValue(head);
    fakes.s3GetObjectPrefix.mockResolvedValue(prefix);

    const response = await genericConfirm(jsonRequest({ mediaId: ids.media }));

    expect(response.status).toBe(status);
    expect(fakes.confirmMediaFileReady).not.toHaveBeenCalled();
    expect(fakes.maybeAutoEnqueueVideoTranscodeAfterUpload).not.toHaveBeenCalled();
    expect(fakes.stagePendingMediaAbort).toHaveBeenCalledOnce();
    expect(fakes.stagePendingMediaAbort).toHaveBeenCalledWith(ids.media);
  });

  it('generic confirm reaches ready only with the branded received result', async () => {
    fakes.getMediaRowForConfirm.mockResolvedValue(pendingRow());

    const response = await genericConfirm(jsonRequest({ mediaId: ids.media }));

    expect(response.status).toBe(200);
    expect(fakes.s3HeadObjectDetails).toHaveBeenCalledWith('uploads/object');
    expect(fakes.s3GetObjectPrefix).toHaveBeenCalledWith('uploads/object');
    expect(fakes.confirmMediaFileReady).toHaveBeenCalledOnce();
    expect(fakes.confirmMediaFileReady.mock.calls[0]?.[1]).toMatchObject({
      intent: { mimeType: 'image/jpeg', sizeBytes: 3 },
    });
  });

  it('multipart complete refuses a bad signature before its atomic finalizer', async () => {
    const sessionRow = {
      id: ids.session,
      media_id: ids.media,
      s3_key: 'uploads/object',
      upload_id: 's3-upload',
      owner_user_id: ids.doctor,
      status: 'initiated',
      expected_size_bytes: '3',
      mime_type: 'image/jpeg',
      original_name: 'photo.jpg',
      part_size_bytes: 3,
      expires_at: new Date('2030-01-01T00:00:00.000Z'),
    };
    fakes.claimUploadSessionForCompletingTx.mockResolvedValue(sessionRow);
    fakes.s3HeadObjectDetails.mockResolvedValue(
      receivedHead({
        metadata: {
          'media-id': ids.media,
          'owner-user-id': ids.doctor,
          'expected-size': '3',
        },
      }),
    );
    fakes.s3GetObjectPrefix.mockResolvedValue(Buffer.from([0x25, 0x50, 0x44]));

    const response = await multipartComplete(
      jsonRequest({ sessionId: ids.session, parts: [{ PartNumber: 1, ETag: 'etag' }] }),
    );

    expect(response.status).toBe(415);
    expect(fakes.tryFinalizeMultipartIdempotentTx).not.toHaveBeenCalled();
  });

  it('patient submission confirm refuses a received mismatch before ready', async () => {
    fakes.getMediaRowForConfirm.mockResolvedValue(
      pendingRow({ usage_purpose: 'program_item_submission' }),
    );
    fakes.s3HeadObjectDetails.mockResolvedValue(receivedHead({ contentLength: 4 }));

    const response = await submissionConfirm(jsonRequest({ mediaId: ids.media }));

    expect(response.status).toBe(413);
    expect(fakes.confirmProgramSubmissionMediaFileReady).not.toHaveBeenCalled();
    expect(fakes.abortPendingProgramSubmissionMedia).toHaveBeenCalledOnce();
    expect(fakes.abortPendingProgramSubmissionMedia).toHaveBeenCalledWith(ids.media);
  });

  it('patient-file confirm refuses a received mismatch before atomic quota/state change', async () => {
    fakes.getMediaRowForConfirm.mockResolvedValue(pendingRow());
    fakes.s3HeadObjectDetails.mockResolvedValue(receivedHead({ contentType: 'application/pdf' }));

    const response = await patientFileConfirm(
      new Request('http://test.local', { method: 'POST' }),
      {
        params: Promise.resolve({ userId: ids.patient, fileId: ids.file }),
      },
    );

    expect(response.status).toBe(415);
    expect(fakes.confirmPatientFileUpload).not.toHaveBeenCalled();
    expect(fakes.stagePendingMediaAbort).toHaveBeenCalledOnce();
    expect(fakes.stagePendingMediaAbort).toHaveBeenCalledWith(ids.media);
  });
});

describe('Ч1 preserved authorization and patient-file lifecycle boundaries', () => {
  it('denies doctor upload intents before any state/storage boundary', async () => {
    fakes.requireDoctorWorkspaceApiContext.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });

    const responses = await Promise.all([
      proxyUpload(proxyRequest(jpegFile())),
      genericPresign(jsonRequest({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 3 })),
      multipartInit(jsonRequest({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 3 })),
      individualPresign(jsonRequest({ filename: 'clip.mp4', mimeType: 'video/mp4', size: 12 }), {
        params: Promise.resolve({ instanceId: ids.instance }),
      }),
      patientFilePresign(
        jsonRequest({
          category: 'прочее',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 3,
        }),
        { params: Promise.resolve({ userId: ids.patient }) },
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.presignPutUrl).not.toHaveBeenCalled();
    expect(fakes.s3CreateMultipartUpload).not.toHaveBeenCalled();
    expect(fakes.insertPendingMediaFileTx).not.toHaveBeenCalled();
    expect(fakes.createPatientFile).not.toHaveBeenCalled();
  });

  it('denies patient submission before any state/storage boundary', async () => {
    fakes.requirePatientApiBusinessAccess.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });

    const responses = await Promise.all([
      submissionPresign(jsonRequest({ filename: 'photo.jpg', mimeType: 'image/jpeg', size: 3 })),
      submissionConfirm(jsonRequest({ mediaId: ids.media })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
    expect(fakes.buildAppDeps).not.toHaveBeenCalled();
    expect(fakes.getMediaRowForConfirm).not.toHaveBeenCalled();
    expect(fakes.presignPutUrl).not.toHaveBeenCalled();
    expect(fakes.confirmProgramSubmissionMediaFileReady).not.toHaveBeenCalled();
  });

  it('denies a patient-file confirm whose file belongs to another patient', async () => {
    fakes.getPatientFile.mockResolvedValue({
      id: ids.file,
      patientUserId: ids.foreignPatient,
      fileName: 'photo.jpg',
      mediaFileId: ids.media,
    });

    const response = await patientFileConfirm(
      new Request('http://test.local', { method: 'POST' }),
      {
        params: Promise.resolve({ userId: ids.patient, fileId: ids.file }),
      },
    );

    expect(response.status).toBe(404);
    expect(fakes.getMediaRowForConfirm).not.toHaveBeenCalled();
    expect(fakes.s3HeadObjectDetails).not.toHaveBeenCalled();
    expect(fakes.confirmPatientFileUpload).not.toHaveBeenCalled();
  });

  it('denies repeat patient-file confirm before storage/state change', async () => {
    fakes.getMediaRowForConfirm.mockResolvedValue(pendingRow({ status: 'ready' }));

    const response = await patientFileConfirm(
      new Request('http://test.local', { method: 'POST' }),
      {
        params: Promise.resolve({ userId: ids.patient, fileId: ids.file }),
      },
    );

    expect(response.status).toBe(409);
    expect(fakes.s3HeadObjectDetails).not.toHaveBeenCalled();
    expect(fakes.confirmPatientFileUpload).not.toHaveBeenCalled();
  });
});
