import { NextResponse } from 'next/server';
import { z } from 'zod';
import { runWithDbPatientPrincipal } from '@bersoncare/db-principal';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { getPool } from '@/app-layer/db/client';
import { withUserLifecycleLock } from '@/app-layer/locks/userLifecycleLock';
import { createPendingProgramSubmissionMediaFile } from '@/app-layer/media/s3MediaStorage';
import { insertUploadSessionTx } from '@/app-layer/media/mediaUploadSessionsRepo';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  abortPendingProgramSubmissionUpload,
  beginAuthorizedMultipartUpload,
  prepareMediaUpload,
  presignPreparedUpload,
} from '@/app-layer/media/mediaUploadAdapter';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import { assertPatientProgramMediaAllowed } from '@/modules/doctor-clients/assertPatientProgramInteraction';
import { isPatientProgramDiscussionMediaFlowEnabled } from '@/modules/program-item-discussion/discussionFeatureGates';
import {
  isProgramSubmissionVideoMime,
  MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS,
} from '@/modules/media/programSubmissionUploadLimits';

const bodySchema = z.object({
  instanceId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  durationSeconds: z.number().finite().positive().optional(),
  uploadMode: z.enum(['single-put', 'multipart']).optional(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

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

  const deps = buildAppDeps();
  const detail = await deps.treatmentProgramInstance.getInstanceForPatient(
    gate.session.user.userId,
    parsed.data.instanceId,
  );
  if (!detail) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const organizationId = detail.organizationId;
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: 'organization_context_missing' }, { status: 500 });
  }
  const supportGate = await runWithDbPatientPrincipal(
    {
      platformUserId: gate.session.user.userId,
      organizationId,
      source: 'patient.program-submission.presign.support-policy',
    },
    () => assertPatientProgramMediaAllowed(deps, gate.session.user.userId, { organizationId }),
  );
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }
  if (
    !(await isPatientProgramDiscussionMediaFlowEnabled(deps, {
      patientUserId: gate.session.user.userId,
      organizationId,
    }))
  ) {
    return NextResponse.json({ ok: false, error: 'feature_disabled' }, { status: 403 });
  }
  if (isProgramSubmissionVideoMime(parsed.data.mimeType)) {
    if (parsed.data.durationSeconds === undefined) {
      return NextResponse.json({ ok: false, error: 'video_metadata_unavailable' }, { status: 400 });
    }
    if (parsed.data.durationSeconds < MIN_PROGRAM_SUBMISSION_VIDEO_DURATION_SECONDS) {
      return NextResponse.json({ ok: false, error: 'video_too_short' }, { status: 400 });
    }
  }

  const prepared = prepareMediaUpload({
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.size,
    policyId: 'patient-program-submission',
    organizationId,
  });
  if (!prepared.ok) {
    const rejection = uploadValidationResponse(prepared);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const upload = prepared.value;
  const mediaId = upload.id;

  try {
    if (parsed.data.uploadMode === 'multipart') {
      const begun = await beginAuthorizedMultipartUpload({
        upload,
        ownerUserId: gate.session.user.userId,
        createPendingAndSession: ({ mediaId, sessionId, uploadId, partSizeBytes, expiresAt }) =>
          runWithDbPatientPrincipal(
            {
              platformUserId: gate.session.user.userId,
              organizationId,
              source: 'patient.media.program-submission.create',
            },
            () =>
              withUserLifecycleLock(
                getPool(),
                gate.session.user.userId,
                'shared',
                async (client) => {
                  await createPendingProgramSubmissionMediaFile({
                    id: mediaId,
                    filename: parsed.data.filename,
                    key: upload.key,
                    mimeType: upload.intent.mimeType,
                    sizeBytes: upload.intent.sizeBytes,
                  });
                  await insertUploadSessionTx(client, {
                    sessionId,
                    mediaId,
                    s3Key: upload.key,
                    uploadId,
                    ownerUserId: gate.session.user.userId,
                    expectedSizeBytes: upload.intent.sizeBytes,
                    mimeType: upload.intent.mimeType,
                    partSizeBytes,
                    expiresAt,
                  });
                },
              ),
          ),
        abortPending: (mediaId) =>
          runWithDbPatientPrincipal(
            {
              platformUserId: gate.session.user.userId,
              organizationId,
              source: 'patient.media.program-submission.abort',
            },
            () => abortPendingProgramSubmissionUpload(mediaId),
          ),
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
    const key = upload.key;
    await createPendingProgramSubmissionMediaFile({
      id: mediaId,
      filename: parsed.data.filename,
      key,
      mimeType: upload.intent.mimeType,
      sizeBytes: upload.intent.sizeBytes,
    });
    const uploadUrl = await presignPreparedUpload(upload);
    return NextResponse.json({
      ok: true as const,
      mediaId,
      uploadUrl,
      readUrl: `/api/media/${mediaId}`,
    });
  } catch (e) {
    await abortPendingProgramSubmissionUpload(mediaId).catch(() => {
      /* best-effort rollback */
    });
    logger.error({ err: e }, '[patient/program-submission/presign] presign_failed');
    return NextResponse.json({ ok: false, error: 'presign_failed' }, { status: 500 });
  }
}
