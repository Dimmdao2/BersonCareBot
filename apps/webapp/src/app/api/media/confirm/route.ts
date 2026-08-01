import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { getMediaRowForConfirm } from '@/app-layer/media/s3MediaStorage';
import { maybeAutoEnqueueVideoTranscodeAfterUpload } from '@/app-layer/media/mediaTranscodeAutoEnqueue';
import {
  acceptReceivedMedia,
  validateReceivedMediaObject,
} from '@/app-layer/media/mediaUploadAdapter';
import { uploadValidationResponse, validateUploadIntent } from '@/modules/media/uploadValidation';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const bodySchema = z.object({
  mediaId: z.string().uuid(),
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

  const row = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    getMediaRowForConfirm(parsed.data.mediaId, session.user.userId),
  );
  if (!row) {
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
    });
  }

  if (row.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 409 });
  }

  const intent = validateUploadIntent({
    filename: parsed.data.mediaId,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes ?? 0,
    policyId: 'cms',
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

  const updated = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    acceptReceivedMedia(parsed.data.mediaId, received.value),
  );
  if (!updated) {
    const again = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      getMediaRowForConfirm(parsed.data.mediaId, session.user.userId),
    );
    if (again?.status === 'ready' && again.s3_key) {
      return NextResponse.json({
        ok: true as const,
        url: appUrl,
        mediaId: parsed.data.mediaId,
      });
    }
    return NextResponse.json({ ok: false, error: 'confirm_race' }, { status: 409 });
  }

  await maybeAutoEnqueueVideoTranscodeAfterUpload(parsed.data.mediaId);

  return NextResponse.json({
    ok: true as const,
    url: appUrl,
    mediaId: parsed.data.mediaId,
  });
}
