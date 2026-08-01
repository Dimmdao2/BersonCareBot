import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { getPool } from '@/app-layer/db/client';
import { withUserLifecycleLock } from '@/app-layer/locks/userLifecycleLock';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { insertPendingProgramSubmissionMediaFileTx } from '@/app-layer/media/s3MediaStorage';
import { pgEnsureClientPatientFolder } from '@/app-layer/media/clientMediaFolders';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  abortPendingMediaUpload,
  prepareMediaUpload,
  presignPreparedUpload,
} from '@/app-layer/media/mediaUploadAdapter';
import { uploadValidationResponse } from '@/modules/media/uploadValidation';
import { assertPatientProgramMediaAllowed } from '@/modules/doctor-clients/assertPatientProgramInteraction';
import { isPatientProgramDiscussionMediaFlowEnabled } from '@/modules/program-item-discussion/discussionFeatureGates';

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  const supportGate = await assertPatientProgramMediaAllowed(deps, gate.session.user.userId);
  if (!supportGate.ok) {
    return NextResponse.json({ ok: false, error: supportGate.error }, { status: 403 });
  }
  const organizationId = supportGate.policy.organizationId;
  if (!organizationId) {
    return NextResponse.json(
      { ok: false, error: 'organization_context_required' },
      { status: 403 },
    );
  }
  if (
    !(await isPatientProgramDiscussionMediaFlowEnabled(deps, {
      patientUserId: gate.session.user.userId,
      organizationId,
    }))
  ) {
    return NextResponse.json({ ok: false, error: 'feature_disabled' }, { status: 403 });
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

  const prepared = prepareMediaUpload({
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
    sizeBytes: parsed.data.size,
    policyId: 'patient-program-submission',
  });
  if (!prepared.ok) {
    const rejection = uploadValidationResponse(prepared);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const upload = prepared.value;

  const mediaId = upload.id;
  const key = upload.key;
  const readUrl = `/api/media/${mediaId}`;

  try {
    await withExplicitOrganizationPrincipal(
      { organizationId, source: 'patient.program-submission.media.presign' },
      async () => {
        const patientFolder = await pgEnsureClientPatientFolder(gate.session.user.userId);
        await withUserLifecycleLock(
          getPool(),
          gate.session.user.userId,
          'shared',
          async (client) => {
            await insertPendingProgramSubmissionMediaFileTx(client, {
              id: mediaId,
              filename: parsed.data.filename,
              key,
              mimeType: upload.intent.mimeType,
              sizeBytes: upload.intent.sizeBytes,
              userId: gate.session.user.userId,
              folderId: patientFolder.id,
            });
          },
        );
      },
    );
    const uploadUrl = await presignPreparedUpload(upload);
    return NextResponse.json({
      ok: true as const,
      mediaId,
      uploadUrl,
      readUrl,
    });
  } catch (e) {
    await withExplicitOrganizationPrincipal(
      { organizationId, source: 'patient.program-submission.media.presign.rollback' },
      async () => {
        await abortPendingMediaUpload(mediaId).catch(() => {
          /* best-effort rollback */
        });
      },
    );
    logger.error({ err: e }, '[patient/program-submission/presign] presign_failed');
    return NextResponse.json({ ok: false, error: 'presign_failed' }, { status: 500 });
  }
}
