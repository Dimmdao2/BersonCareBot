import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { getMediaRowForConfirm } from '@/app-layer/media/s3MediaStorage';
import {
  abortPendingMediaUpload,
  validateReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import { uploadValidationResponse, validateUploadIntent } from '@/modules/media/uploadValidation';

const FILES_QUOTA_REACHED_MESSAGE = 'saas_quota_reached:files';

/** The second stage of patient-file intake: only a stored, validated object becomes visible/charged. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string; fileId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { userId, fileId } = await context.params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(fileId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const file = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientFiles.getFile(fileId),
  );
  if (!file || file.patientUserId !== identity.userId || !file.mediaFileId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    getMediaRowForConfirm(file.mediaFileId!, gate.ctx.session.user.userId),
  );
  if (!row?.s3_key || row.status !== 'pending') {
    return NextResponse.json(
      { ok: false, error: row ? 'invalid_status' : 'not_found' },
      { status: row ? 409 : 404 },
    );
  }
  const intent = validateUploadIntent({
    filename: file.fileName,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes ?? 0,
    policyId: 'patient-file',
  });
  if (!intent.ok) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(file.mediaFileId!));
    const rejection = uploadValidationResponse(intent);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  const received = await validateReceivedMediaObject({ key: row.s3_key, intent: intent.value });
  if (!received.ok) {
    await withDoctorWorkspacePrincipal(gate.ctx, () => abortPendingMediaUpload(file.mediaFileId!));
    const rejection = uploadValidationResponse(received);
    return NextResponse.json(rejection.body, { status: rejection.status });
  }
  try {
    const confirmed = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.patientFiles.confirmFileUpload(file.mediaFileId!, received.value),
    );
    if (!confirmed) return NextResponse.json({ ok: false, error: 'confirm_race' }, { status: 409 });
    return NextResponse.json({ ok: true, file: confirmed });
  } catch (error) {
    if (error instanceof Error && error.message === FILES_QUOTA_REACHED_MESSAGE) {
      return NextResponse.json({ ok: false, error: 'file_storage_limit_reached' }, { status: 403 });
    }
    throw error;
  }
}
