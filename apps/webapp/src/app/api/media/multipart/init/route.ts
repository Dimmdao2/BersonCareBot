import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { getPool } from '@/app-layer/db/client';
import { logger } from '@/app-layer/logging/logger';
import { pgFolderExists } from '@/app-layer/media/mediaFoldersRepo';
import { pgValidateUserAssignableMediaFolder } from '@/app-layer/media/clientMediaFolders';
import { insertUploadSessionTx } from '@/app-layer/media/mediaUploadSessionsRepo';
import { insertPendingMediaFileTx } from '@/app-layer/media/s3MediaStorage';
import {
  abortPendingMediaUpload,
  beginAuthorizedMultipartUpload,
  prepareMediaUpload,
} from '@/app-layer/media/mediaUploadAdapter';
import { withUserLifecycleLock } from '@/app-layer/locks/userLifecycleLock';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'files');
  if (!entitlement.ok) return entitlement.response;
  const session = gate.ctx.session;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const prepared = prepareMediaUpload({
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.size,
    policyId: 'cms',
  });
  if (!prepared.ok) {
    const rejection = uploadValidationResponse(prepared);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const upload = prepared.value;

  let folderId: string | null = null;
  if (parsed.data.folderId !== undefined && parsed.data.folderId !== null) {
    const assignable = await pgValidateUserAssignableMediaFolder(parsed.data.folderId);
    if (!assignable.ok) {
      const status = assignable.error === 'folder_not_found' ? 404 : 400;
      return NextResponse.json({ ok: false, error: assignable.error }, { status });
    }
    const exists = await pgFolderExists(parsed.data.folderId);
    if (!exists) {
      return NextResponse.json({ ok: false, error: 'folder_not_found' }, { status: 404 });
    }
    folderId = parsed.data.folderId;
  } else if (parsed.data.folderId === null) {
    folderId = null;
  }

  try {
    const begun = await beginAuthorizedMultipartUpload({
      upload,
      ownerUserId: session.user.userId,
      createPendingAndSession: ({ mediaId, sessionId, uploadId, partSizeBytes, expiresAt }) =>
        withDoctorWorkspacePrincipal(gate.ctx, () =>
          withUserLifecycleLock(getPool(), session.user.userId, 'shared', async (client) => {
            await insertPendingMediaFileTx(client, {
              id: mediaId,
              filename: parsed.data.filename,
              key: upload.key,
              mimeType: upload.intent.mimeType,
              sizeBytes: upload.intent.sizeBytes,
              userId: session.user.userId,
              folderId,
              storageTarget: upload.target,
            });
            await insertUploadSessionTx(client, {
              sessionId,
              mediaId,
              s3Key: upload.key,
              uploadId,
              ownerUserId: session.user.userId,
              expectedSizeBytes: upload.intent.sizeBytes,
              mimeType: upload.intent.mimeType,
              partSizeBytes,
              expiresAt,
            });
          }),
        ),
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
  } catch (e) {
    logger.error({ err: e }, '[media/multipart/init] failed');
    return NextResponse.json({ ok: false, error: 'multipart_init_failed' }, { status: 500 });
  }
}
