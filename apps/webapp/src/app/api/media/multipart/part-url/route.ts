import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import {
  bumpSessionToUploading,
  gateUploadSessionForPartUrl,
} from '@/app-layer/media/mediaUploadSessionsRepo';
import { presignPreparedUploadPart } from '@/app-layer/media/mediaUploadAdapter';
import { multipartMaxPartNumber } from '@/modules/media/multipartConstants';
import { requireMediaMultipartApiContext } from '@/app-layer/guards/mediaMultipartApiContext';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  partNumber: z.number().int().min(1).max(10_000),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requireMediaMultipartApiContext();
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

  const gated = await gateUploadSessionForPartUrl(
    parsed.data.sessionId,
    gate.ctx.userId,
    gate.ctx.kind === 'doctor' ? gate.ctx.organizationId : null,
  );
  if (!gated.ok) {
    const status = gated.error === 'session_not_found' ? 404 : 409;
    return NextResponse.json({ ok: false, error: gated.error }, { status });
  }
  const row = gated.row;

  const expectedSize = Number.parseInt(row.expected_size_bytes, 10);
  const maxPart = multipartMaxPartNumber(expectedSize, row.part_size_bytes);
  if (parsed.data.partNumber > maxPart) {
    return NextResponse.json({ ok: false, error: 'part_out_of_range', maxPart }, { status: 400 });
  }

  await bumpSessionToUploading(parsed.data.sessionId);

  const uploadUrl = await presignPreparedUploadPart({
    key: row.s3_key,
    uploadId: row.upload_id,
    partNumber: parsed.data.partNumber,
    target: row.storage_target,
  });
  return NextResponse.json({
    ok: true as const,
    uploadUrl,
    partNumber: parsed.data.partNumber,
  });
}
