import { randomUUID } from 'node:crypto';
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
  abortPreparedMultipartUpload,
  abortPendingMediaUpload,
  beginPreparedMultipartUpload,
  prepareMediaUpload,
} from '@/app-layer/media/mediaUploadAdapter';
import { withUserLifecycleLock } from '@/app-layer/locks/userLifecycleLock';
import {
  chooseMultipartPartSize,
  MULTIPART_SESSION_TTL_MS,
  multipartMaxPartNumber,
} from '@/modules/media/multipartConstants';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

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

  const mediaId = upload.id;
  const sessionId = randomUUID();
  const key = upload.key;
  const readUrl = `/api/media/${mediaId}`;
  const partSizeBytes = chooseMultipartPartSize(upload.intent.sizeBytes);
  const maxParts = multipartMaxPartNumber(upload.intent.sizeBytes, partSizeBytes);
  const expiresAt = new Date(Date.now() + MULTIPART_SESSION_TTL_MS);

  const metadata = {
    'media-id': mediaId,
    'owner-user-id': session.user.userId,
    'expected-size': String(upload.intent.sizeBytes),
  };

  let uploadId: string | null = null;
  try {
    const created = await beginPreparedMultipartUpload(upload, metadata);
    uploadId = created.uploadId;

    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      withUserLifecycleLock(getPool(), session.user.userId, 'shared', async (client) => {
        await insertPendingMediaFileTx(client, {
          id: mediaId,
          filename: parsed.data.filename,
          key,
          mimeType: upload.intent.mimeType,
          sizeBytes: upload.intent.sizeBytes,
          userId: session.user.userId,
          folderId,
        });
        await insertUploadSessionTx(client, {
          sessionId,
          mediaId,
          s3Key: key,
          uploadId: created.uploadId,
          ownerUserId: session.user.userId,
          expectedSizeBytes: upload.intent.sizeBytes,
          mimeType: upload.intent.mimeType,
          partSizeBytes,
          expiresAt,
        });
      }),
    );

    return NextResponse.json({
      ok: true as const,
      mediaId,
      sessionId,
      uploadId: created.uploadId,
      partSizeBytes,
      maxParts,
      expiresAt: expiresAt.toISOString(),
      readUrl,
    });
  } catch (e) {
    if (uploadId) {
      await abortPreparedMultipartUpload(key, uploadId).catch(() => {
        /* best-effort */
      });
    }
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(mediaId)).catch(
      () => {
        /* ignore */
      },
    );
    logger.error({ err: e }, '[media/multipart/init] failed');
    return NextResponse.json({ ok: false, error: 'multipart_init_failed' }, { status: 500 });
  }
}
