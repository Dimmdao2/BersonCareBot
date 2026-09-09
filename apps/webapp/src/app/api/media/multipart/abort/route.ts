import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { getPool } from '@/app-layer/db/client';
import { withMultipartSessionLock } from '@/app-layer/locks/multipartSessionLock';
import { abortMultipartPendingTx } from '@/app-layer/media/mediaUploadSessionsRepo';
import {
  abortPreparedMultipartUpload,
  abortPendingProgramSubmissionUpload,
  inspectReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import { gateUploadSessionForPartUrl } from '@/app-layer/media/mediaUploadSessionsRepo';
import {
  requireMediaMultipartApiContext,
  withMediaMultipartPrincipal,
} from '@/app-layer/guards/mediaMultipartApiContext';
import { parseUploadPolicyId } from '@/modules/media/uploadValidation';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requireMediaMultipartApiContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.kind === 'doctor') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.doctor.ctx, 'files');
    if (!entitlement.ok) return entitlement.response;
  }

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
  const { sessionId } = parsed.data;

  if (gate.ctx.kind === 'patient') {
    const active = await gateUploadSessionForPartUrl(sessionId, gate.ctx.userId, null);
    if (!active.ok)
      return NextResponse.json(
        { ok: false, error: active.error },
        { status: active.error === 'session_not_found' ? 404 : 409 },
      );
    const row = active.row;
    const head = await inspectReceivedMediaObject(row.s3_key, row.storage_target);
    if (parseUploadPolicyId(head?.metadata['upload-policy']) !== 'patient-program-submission') {
      return NextResponse.json({ ok: false, error: 'session_not_found' }, { status: 404 });
    }
    await withMediaMultipartPrincipal(
      gate.ctx,
      row.organization_id,
      'patient.media.program-submission.abort',
      () => abortPendingProgramSubmissionUpload(row.media_id),
    );
    await abortPreparedMultipartUpload(row.s3_key, row.upload_id, row.storage_target).catch(
      (error) => {
        logger.warn({ err: error, sessionId }, '[media/multipart/abort] s3_abort_best_effort');
      },
    );
    return NextResponse.json({ ok: true as const });
  }

  const dbResult = await withMultipartSessionLock(pool, sessionId, async (client) =>
    abortMultipartPendingTx(client, sessionId, gate.ctx.userId, gate.ctx.organizationId),
  );

  if (dbResult.ok === 'not_found') {
    return NextResponse.json({ ok: true as const, alreadyGone: true });
  }
  if (dbResult.ok === 'already_completed') {
    return NextResponse.json({ ok: true as const, alreadyCompleted: true });
  }
  if (dbResult.ok === 'already_final') {
    return NextResponse.json({ ok: true as const, alreadyFinal: true });
  }

  await abortPreparedMultipartUpload(
    dbResult.s3Key,
    dbResult.uploadId,
    dbResult.storageTarget,
  ).catch((e) => {
    logger.warn({ err: e, sessionId }, '[media/multipart/abort] s3_abort_best_effort');
  });

  return NextResponse.json({ ok: true as const });
}
