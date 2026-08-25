import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env, isS3MediaEnabled } from '@/config/env';
import { logger } from '@/app-layer/logging/logger';
import { getPool } from '@/app-layer/db/client';
import { withMultipartSessionLock } from '@/app-layer/locks/multipartSessionLock';
import { abortMultipartPendingTx } from '@/app-layer/media/mediaUploadSessionsRepo';
import { s3AbortMultipartUpload } from '@/app-layer/media/s3Client';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isS3MediaEnabled(env)) {
    return NextResponse.json({ ok: false, error: 's3_not_configured' }, { status: 501 });
  }

  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'files');
  if (!entitlement.ok) return entitlement.response;

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

  const dbResult = await withMultipartSessionLock(pool, sessionId, async (client) =>
    abortMultipartPendingTx(
      client,
      sessionId,
      gate.ctx.session.user.userId,
      gate.ctx.organizationId,
    ),
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

  await s3AbortMultipartUpload(dbResult.s3Key, dbResult.uploadId).catch((e) => {
    logger.warn({ err: e, sessionId }, '[media/multipart/abort] s3_abort_best_effort');
  });

  return NextResponse.json({ ok: true as const });
}
