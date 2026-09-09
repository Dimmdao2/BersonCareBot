import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { getPool } from '@/app-layer/db/client';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { withMultipartSessionLock } from '@/app-layer/locks/multipartSessionLock';
import {
  claimUploadSessionForCompletingTx,
  classifyMultipartCompleteRejection,
  completeMultipartSessionAfterPolicyFinalizerTx,
  getCompletedSessionTx,
  getCompletingSessionTx,
  markCompletingSessionFailedTx,
} from '@/app-layer/media/mediaUploadSessionsRepo';
import { maybeAutoEnqueueVideoTranscodeAfterUpload } from '@/app-layer/media/mediaTranscodeAutoEnqueue';
import {
  acceptReceivedProgramSubmission,
  completePreparedMultipartUpload,
  finalizeReceivedMultipart,
  inspectReceivedMediaObject,
  validateReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import {
  requireMediaMultipartApiContext,
  withMediaMultipartPrincipal,
} from '@/app-layer/guards/mediaMultipartApiContext';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { multipartMaxPartNumber } from '@/modules/media/multipartConstants';
import {
  parseUploadPolicyId,
  uploadValidationResponse,
  validateUploadIntent,
} from '@/modules/media/uploadValidation';

const partSchema = z.object({
  PartNumber: z.number().int().min(1).max(10_000),
  ETag: z.string().min(1).max(2048),
});
const bodySchema = z.object({
  sessionId: z.string().uuid(),
  parts: z.array(partSchema).min(1).max(10_000),
});

function hasExactParts(parts: z.infer<typeof partSchema>[], maxPart: number): boolean {
  return (
    parts.length === maxPart &&
    new Set(parts.map((part) => part.PartNumber)).size === maxPart &&
    parts.every((part) => part.PartNumber <= maxPart)
  );
}

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env))
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  const gate = await requireMediaMultipartApiContext();
  if (!gate.ok) return gate.response;
  if (gate.ctx.kind === 'doctor') {
    const entitlement = await requireEntitlementForMutation(gate.ctx.doctor.ctx, 'files');
    if (!entitlement.ok) return entitlement.response;
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const pool = getPool();
  const ownerUserId = gate.ctx.userId;
  const requestedOrgId = gate.ctx.kind === 'doctor' ? gate.ctx.organizationId : null;
  let row = await withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
    claimUploadSessionForCompletingTx(client, parsed.data.sessionId, ownerUserId, requestedOrgId),
  );
  let skipS3Complete = false;
  if (!row) {
    row = await withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
      getCompletingSessionTx(client, parsed.data.sessionId, ownerUserId, requestedOrgId),
    );
    if (row) skipS3Complete = true;
  }
  if (!row) {
    const completed = await withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
      getCompletedSessionTx(client, parsed.data.sessionId, ownerUserId, requestedOrgId),
    );
    if (completed)
      return NextResponse.json({
        ok: true as const,
        url: `/api/media/${completed.media_id}`,
        mediaId: completed.media_id,
      });
    const error = await classifyMultipartCompleteRejection(
      pool,
      parsed.data.sessionId,
      ownerUserId,
      requestedOrgId,
    );
    return NextResponse.json(
      { ok: false, error },
      { status: error === 'session_not_found' ? 404 : 409 },
    );
  }
  const organizationId = row.organization_id;
  const run = <T>(source: string, action: () => Promise<T>) =>
    withMediaMultipartPrincipal(gate.ctx, organizationId, source, action);
  const expectedSize = Number.parseInt(row.expected_size_bytes, 10);
  const maxPart = multipartMaxPartNumber(expectedSize, row.part_size_bytes);
  if (!hasExactParts(parsed.data.parts, maxPart)) {
    await run('media.multipart.complete.invalid-parts', () =>
      withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
        markCompletingSessionFailedTx(
          client,
          parsed.data.sessionId,
          organizationId,
          'invalid_parts',
        ),
      ),
    );
    return NextResponse.json({ ok: false, error: 'invalid_parts', maxPart }, { status: 400 });
  }
  if (!skipS3Complete) {
    try {
      await completePreparedMultipartUpload(
        row.s3_key,
        row.upload_id,
        parsed.data.parts,
        row.storage_target,
      );
    } catch (error) {
      logger.error(
        { err: error, sessionId: parsed.data.sessionId },
        '[media/multipart/complete] s3_complete_failed',
      );
      await run('media.multipart.complete.s3-failed', () =>
        withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
          markCompletingSessionFailedTx(
            client,
            parsed.data.sessionId,
            organizationId,
            's3_complete_failed',
          ),
        ),
      );
      return NextResponse.json({ ok: false, error: 'complete_failed' }, { status: 502 });
    }
  }
  const head = await inspectReceivedMediaObject(row.s3_key, row.storage_target);
  const policyId = parseUploadPolicyId(head?.metadata['upload-policy']);
  const metadataMatches =
    head &&
    head.contentLength === expectedSize &&
    (head.contentType ?? '').split(';')[0]!.trim().toLowerCase() === row.mime_type.toLowerCase() &&
    head.metadata['media-id'] === row.media_id &&
    head.metadata['owner-user-id'] === ownerUserId &&
    head.metadata['expected-size'] === String(expectedSize);
  if (
    !metadataMatches ||
    !policyId ||
    policyId === 'proxy' ||
    (policyId === 'patient-program-submission') !==
      (row.usage_purpose === 'program_item_submission')
  ) {
    await run('media.multipart.complete.integrity', () =>
      withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
        markCompletingSessionFailedTx(
          client,
          parsed.data.sessionId,
          organizationId,
          'integrity_mismatch',
        ),
      ),
    );
    return NextResponse.json({ ok: false, error: 'integrity_mismatch' }, { status: 409 });
  }
  const intent = validateUploadIntent({
    filename: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: expectedSize,
    policyId,
  });
  if (!intent.ok) {
    const rejection = uploadValidationResponse(intent);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const received = await validateReceivedMediaObject({
    key: row.s3_key,
    intent: intent.value,
    target: row.storage_target,
  });
  if (!received.ok) {
    const rejection = uploadValidationResponse(received);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  try {
    if (policyId === 'cms' || policyId === 'individual-exercise-video') {
      const finalized = await run('media.multipart.complete.media', () =>
        withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
          finalizeReceivedMultipart(client, {
            sessionId: parsed.data.sessionId,
            mediaId: row!.media_id,
            ownerUserId,
            organizationId,
            received: received.value,
          }),
        ),
      );
      if (finalized.kind === 'partial')
        return NextResponse.json(
          { ok: false, error: 'finalize_inconsistent_state' },
          { status: 409 },
        );
    } else {
      const policyFinalized = await run(
        policyId === 'patient-program-submission'
          ? 'patient.media.program-submission.confirm'
          : 'media.multipart.complete.patient-file',
        async () =>
          policyId === 'patient-program-submission'
            ? acceptReceivedProgramSubmission(row!.media_id, received.value)
            : (await buildAppDeps().patientFiles.confirmFileUpload(
                row!.media_id,
                received.value,
              )) !== null,
      );
      const settled = await run('media.multipart.complete.session-cas', () =>
        withMultipartSessionLock(pool, parsed.data.sessionId, (client) =>
          completeMultipartSessionAfterPolicyFinalizerTx(
            client,
            parsed.data.sessionId,
            row!.media_id,
            ownerUserId,
            organizationId,
          ),
        ),
      );
      if (!policyFinalized && settled !== 'finalized' && settled !== 'already_done')
        return NextResponse.json(
          { ok: false, error: 'finalize_inconsistent_state' },
          { status: 409 },
        );
      if (settled !== 'finalized' && settled !== 'already_done')
        return NextResponse.json(
          { ok: false, error: 'finalize_inconsistent_state' },
          { status: 409 },
        );
    }
    if (policyId !== 'patient-program-submission') {
      await maybeAutoEnqueueVideoTranscodeAfterUpload(row.media_id, received.value.intent.mimeType);
    }
    return NextResponse.json({
      ok: true as const,
      url: `/api/media/${row.media_id}`,
      mediaId: row.media_id,
    });
  } catch (error) {
    logger.error(
      { err: error, sessionId: parsed.data.sessionId },
      '[media/multipart/complete] finalize_failed',
    );
    return NextResponse.json(
      { ok: false, error: 'finalize_failed', retryable: true },
      { status: 500 },
    );
  }
}
