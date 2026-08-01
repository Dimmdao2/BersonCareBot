import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { getMediaRowForConfirm } from '@/app-layer/media/s3MediaStorage';
import { enqueueProgramSubmissionTranscodeAfterConfirm } from '@/app-layer/media/programSubmissionTranscodeEnqueue';
import {
  acceptReceivedProgramSubmission,
  validateReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isProgramSubmissionVideoMime } from '@/modules/media/programSubmissionUploadLimits';
import { uploadValidationResponse, validateUploadIntent } from '@/modules/media/uploadValidation';
import { assertPatientProgramMediaAllowed } from '@/modules/doctor-clients/assertPatientProgramInteraction';
import { isPatientProgramDiscussionMediaFlowEnabled } from '@/modules/program-item-discussion/discussionFeatureGates';

const bodySchema = z.object({
  mediaId: z.string().uuid(),
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

  const row = await getMediaRowForConfirm(parsed.data.mediaId, gate.session.user.userId);
  if (!row) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (row.usage_purpose !== 'program_item_submission') {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (!row.s3_key) {
    return NextResponse.json({ ok: false, error: 'missing_s3_key' }, { status: 500 });
  }

  const appUrl = `/api/media/${parsed.data.mediaId}`;

  if (row.status === 'ready') {
    return NextResponse.json({
      ok: true as const,
      url: appUrl,
      mediaId: parsed.data.mediaId,
      processing: isProgramSubmissionVideoMime(row.mime_type),
    });
  }

  if (row.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 409 });
  }

  const intent = validateUploadIntent({
    filename: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes ?? 0,
    policyId: 'patient-program-submission',
  });
  if (!intent.ok) {
    const rejection = uploadValidationResponse(intent);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const received = await validateReceivedMediaObject({ key: row.s3_key, intent: intent.value });
  if (!received.ok) {
    const rejection = uploadValidationResponse(received);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }

  const updated = await acceptReceivedProgramSubmission(parsed.data.mediaId, received.value);
  if (!updated) {
    const again = await getMediaRowForConfirm(parsed.data.mediaId, gate.session.user.userId);
    if (again?.status === 'ready' && again.s3_key) {
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: parsed.data.mediaId,
        processing: isProgramSubmissionVideoMime(again.mime_type),
      });
    }
    return NextResponse.json({ ok: false, error: 'confirm_race' }, { status: 409 });
  }

  const isVideo = isProgramSubmissionVideoMime(row.mime_type);
  let processing = false;
  if (isVideo) {
    const enq = await enqueueProgramSubmissionTranscodeAfterConfirm(parsed.data.mediaId);
    processing = enq.ok;
  }

  return NextResponse.json({
    ok: true as const,
    url: appUrl,
    mediaId: parsed.data.mediaId,
    processing,
  });
}
