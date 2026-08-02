import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { getPool } from '@/app-layer/db/client';
import { logger } from '@/app-layer/logging/logger';
import { withMultipartSessionLock } from '@/app-layer/locks/multipartSessionLock';
import {
  claimUploadSessionForCompletingTx,
  classifyMultipartCompleteRejection,
  getCompletingSessionTx,
  markCompletingSessionFailedTx,
} from '@/app-layer/media/mediaUploadSessionsRepo';
import { maybeAutoEnqueueVideoTranscodeAfterUpload } from '@/app-layer/media/mediaTranscodeAutoEnqueue';
import {
  abortPreparedMultipartUpload,
  abortPendingMediaUpload,
  completePreparedMultipartUpload,
  finalizeReceivedMultipart,
  inspectReceivedMediaObject,
  validateReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import { multipartMaxPartNumber } from '@/modules/media/multipartConstants';
import { uploadValidationResponse, validateUploadIntent } from '@/modules/media/uploadValidation';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const partSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: z.string().min(1).max(2048),
});

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  parts: z.array(partSchema).min(1).max(10_000),
});

function validateParts(parts: z.infer<typeof partSchema>[], maxPart: number): boolean {
  if (parts.length !== maxPart) return false;
  const nums = new Set<number>();
  for (const p of parts) {
    if (nums.has(p.PartNumber)) return false;
    nums.add(p.PartNumber);
  }
  for (let i = 1; i <= maxPart; i += 1) {
    if (!nums.has(i)) return false;
  }
  return true;
}

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

  const pool = getPool();
  const ownerId = session.user.userId;
  const { sessionId } = parsed.data;

  const claimed = await withMultipartSessionLock(pool, sessionId, async (client) =>
    claimUploadSessionForCompletingTx(client, sessionId, ownerId, gate.ctx.organizationId),
  );

  let row = claimed;
  let skipS3Complete = false;

  if (!row) {
    const stuck = await withMultipartSessionLock(pool, sessionId, async (client) =>
      getCompletingSessionTx(client, sessionId, ownerId, gate.ctx.organizationId),
    );
    if (!stuck) {
      const err = await classifyMultipartCompleteRejection(
        pool,
        sessionId,
        ownerId,
        gate.ctx.organizationId,
      );
      const status = err === 'session_not_found' ? 404 : 409;
      return NextResponse.json({ ok: false, error: err }, { status });
    }
    row = stuck;
    skipS3Complete = true;
  }

  const expectedSize = Number.parseInt(row.expected_size_bytes, 10);
  const maxPart = multipartMaxPartNumber(expectedSize, row.part_size_bytes);

  if (!validateParts(parsed.data.parts, maxPart)) {
    await withMultipartSessionLock(pool, sessionId, async (client) => {
      await markCompletingSessionFailedTx(
        client,
        sessionId,
        gate.ctx.organizationId,
        'invalid_parts',
      );
    });
    await abortPreparedMultipartUpload(row.s3_key, row.upload_id).catch(() => {
      /* ignore */
    });
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(row.media_id)).catch(
      () => {
        /* ignore */
      },
    );
    return NextResponse.json({ ok: false, error: 'invalid_parts', maxPart }, { status: 400 });
  }

  if (!skipS3Complete) {
    try {
      await completePreparedMultipartUpload(row.s3_key, row.upload_id, parsed.data.parts);
    } catch (e) {
      logger.error({ err: e, sessionId }, '[media/multipart/complete] s3_complete_failed');
      await withMultipartSessionLock(pool, sessionId, async (client) => {
        await markCompletingSessionFailedTx(
          client,
          sessionId,
          gate.ctx.organizationId,
          's3_complete_failed',
        );
      });
      await abortPreparedMultipartUpload(row.s3_key, row.upload_id).catch(() => {
        /* ignore */
      });
      await withDoctorWorkspacePrincipal(gate.ctx, () =>
        abortPendingMediaUpload(row.media_id),
      ).catch(() => {
        /* ignore */
      });
      return NextResponse.json({ ok: false, error: 'complete_failed' }, { status: 502 });
    }
  }

  const head = await inspectReceivedMediaObject(row.s3_key);
  const metaOk =
    head &&
    head.contentLength === expectedSize &&
    (head.contentType ?? '').split(';')[0]!.trim().toLowerCase() === row.mime_type.toLowerCase() &&
    head.metadata['media-id'] === row.media_id &&
    head.metadata['owner-user-id'] === ownerId &&
    head.metadata['expected-size'] === String(expectedSize);

  if (!metaOk) {
    logger.warn(
      {
        sessionId,
        head: head ? { len: head.contentLength, ct: head.contentType, md: head.metadata } : null,
      },
      '[media/multipart/complete] integrity_mismatch',
    );
    await withMultipartSessionLock(pool, sessionId, async (client) => {
      await markCompletingSessionFailedTx(
        client,
        sessionId,
        gate.ctx.organizationId,
        'integrity_mismatch',
      );
    });
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(row.media_id)).catch(
      () => {
        /* ignore */
      },
    );
    return NextResponse.json({ ok: false, error: 'integrity_mismatch' }, { status: 409 });
  }

  const intent = validateUploadIntent({
    filename: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: expectedSize,
    policyId: 'cms',
  });
  if (!intent.ok) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(row.media_id));
    const rejection = uploadValidationResponse(intent);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const received = await validateReceivedMediaObject({ key: row.s3_key, intent: intent.value });
  if (!received.ok) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(row.media_id));
    const rejection = uploadValidationResponse(received);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }

  try {
    const fin = await withMultipartSessionLock(pool, sessionId, async (client) =>
      finalizeReceivedMultipart(client, {
        sessionId,
        mediaId: row.media_id,
        ownerUserId: ownerId,
        organizationId: gate.ctx.organizationId,
        received: received.value,
      }),
    );

    if (fin.kind === 'finalized' || fin.kind === 'already_done') {
      await maybeAutoEnqueueVideoTranscodeAfterUpload(row.media_id);
      const appUrl = `/api/media/${row.media_id}`;
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: row.media_id,
      });
    }

    logger.error(
      { sessionId, result: fin.result },
      '[media/multipart/complete] finalize_inconsistent_state',
    );
    return NextResponse.json({ ok: false, error: 'finalize_inconsistent_state' }, { status: 409 });
  } catch (e) {
    logger.error({ err: e, sessionId }, '[media/multipart/complete] finalize_failed');
    return NextResponse.json(
      { ok: false, error: 'finalize_failed', retryable: true },
      { status: 500 },
    );
  }
}
