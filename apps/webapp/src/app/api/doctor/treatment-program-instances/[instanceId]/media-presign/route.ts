import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getPool } from '@/app-layer/db/client';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withUserLifecycleLock } from '@/app-layer/locks/userLifecycleLock';
import { logger } from '@/app-layer/logging/logger';
import { pgEnsureClientPatientFolder } from '@/app-layer/media/clientMediaFolders';
import { insertPendingMediaFileTx } from '@/app-layer/media/s3MediaStorage';
import { env, isS3MediaEnabled } from '@/config/env';
import {
  abortPendingMediaUpload,
  beginAuthorizedMultipartUpload,
  prepareMediaUpload,
  presignPreparedUpload,
} from '@/app-layer/media/mediaUploadAdapter';
import { insertUploadSessionTx } from '@/app-layer/media/mediaUploadSessionsRepo';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import { resolveDoctorInstanceInWorkspace } from '../../_doctorInstanceWorkspace';

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  uploadMode: z.enum(['single-put', 'multipart']).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ instanceId: string }> }) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'exercise_catalog');
  if (!entitlement.ok) return entitlement.response;
  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const prepared = prepareMediaUpload({
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.size,
    policyId: 'individual-exercise-video',
  });
  if (!prepared.ok) {
    const rejection = uploadValidationResponse(prepared);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const upload = prepared.value;

  const deps = buildAppDeps();
  const resolved = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId, {
      clientChannel: 'mediaAllowed',
    }),
  );
  if (!resolved.ok) return resolved.response;

  try {
    if (parsed.data.uploadMode === 'multipart') {
      const begun = await beginAuthorizedMultipartUpload({
        upload,
        ownerUserId: gate.ctx.session.user.userId,
        createPendingAndSession: ({ mediaId, sessionId, uploadId, partSizeBytes, expiresAt }) =>
          withDoctorWorkspacePrincipal(gate.ctx, async () => {
            const folder = await pgEnsureClientPatientFolder(resolved.instance.patientUserId);
            await withUserLifecycleLock(
              getPool(),
              gate.ctx.session.user.userId,
              'shared',
              async (client) => {
                await insertPendingMediaFileTx(client, {
                  id: mediaId,
                  filename: parsed.data.filename,
                  key: upload.key,
                  mimeType: upload.intent.mimeType,
                  sizeBytes: upload.intent.sizeBytes,
                  userId: gate.ctx.session.user.userId,
                  folderId: folder.id,
                  storageTarget: upload.target,
                });
                await insertUploadSessionTx(client, {
                  sessionId,
                  mediaId,
                  s3Key: upload.key,
                  uploadId,
                  ownerUserId: gate.ctx.session.user.userId,
                  expectedSizeBytes: upload.intent.sizeBytes,
                  mimeType: upload.intent.mimeType,
                  partSizeBytes,
                  expiresAt,
                });
              },
            );
          }),
        abortPending: (mediaId) =>
          withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(mediaId)),
      });
      return NextResponse.json({
        ok: true as const,
        mediaId: begun.mediaId,
        sessionId: begun.sessionId,
        uploadId: begun.uploadId,
        partSizeBytes: begun.partSizeBytes,
        maxParts: begun.maxParts,
        expiresAt: begun.expiresAt.toISOString(),
        readUrl: `/api/media/${begun.mediaId}`,
      });
    }
    const mediaId = upload.id;
    const key = upload.key;
    await withDoctorWorkspacePrincipal(gate.ctx, async () => {
      const folder = await pgEnsureClientPatientFolder(resolved.instance.patientUserId);
      await withUserLifecycleLock(
        getPool(),
        gate.ctx.session.user.userId,
        'shared',
        async (client) => {
          await insertPendingMediaFileTx(client, {
            id: mediaId,
            filename: parsed.data.filename,
            key,
            mimeType: upload.intent.mimeType,
            sizeBytes: upload.intent.sizeBytes,
            userId: gate.ctx.session.user.userId,
            folderId: folder.id,
            storageTarget: upload.target,
          });
        },
      );
    });
    const uploadUrl = await presignPreparedUpload(upload);
    return NextResponse.json({
      ok: true as const,
      mediaId,
      uploadUrl,
      readUrl: `/api/media/${mediaId}`,
    });
  } catch (error) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(upload.id)).catch(
      () => undefined,
    );
    logger.error({ err: error }, '[doctor/individual-exercise/media-presign] presign_failed');
    return NextResponse.json({ ok: false, error: 'presign_failed' }, { status: 500 });
  }
}
