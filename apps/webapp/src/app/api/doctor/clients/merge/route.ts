import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { getPool } from '@/app-layer/db/client';
import { runManualPlatformUserMerge } from '@/app-layer/merge/manualPlatformUserMerge';
import { verifyManualMergeIntegratorIntegratorGate } from '@/app-layer/merge/manualMergeIntegratorGate';

const winner = z.enum(['target', 'duplicate']);
const resolutionSchema = z.object({
  targetId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  fields: z.object({
    phone_normalized: winner,
    display_name: winner,
    first_name: winner,
    last_name: winner,
    email: winner,
  }),
  bindings: z.object({
    telegram: z.enum(['target', 'duplicate', 'both']),
    max: z.enum(['target', 'duplicate', 'both']),
    vk: z.enum(['target', 'duplicate', 'both']),
  }),
  oauth: z.record(z.string(), winner),
  channelPreferences: z.enum(['keep_target', 'keep_newer', 'merge']),
});

/** D26 support-only merge: manual transfer may include clinical history in either direction. */
export async function POST(request: Request) {
  const adminGate = await requirePlatformOperationsApiContext();
  if (!adminGate.ok) return adminGate.response;
  const parsed = resolutionSchema.safeParse((await request.json().catch(() => null))?.resolution);
  if (!parsed.success || parsed.data.targetId === parsed.data.duplicateId) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const pool = getPool();
  const integratorGate = await verifyManualMergeIntegratorIntegratorGate(
    pool,
    parsed.data.targetId,
    parsed.data.duplicateId,
  );
  if (!integratorGate.ok) return integratorGate.response;
  const result = await runManualPlatformUserMerge(pool, adminGate.session.user.userId, parsed.data, {
    allowDistinctIntegratorUserIds: integratorGate.allowDistinctIntegratorUserIds,
    verifiedDistinctIntegratorUserIds: integratorGate.verifiedDistinctIntegratorUserIds,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: 'merge_failed', code: result.code, message: result.error },
      { status: 409 },
    );
  }
  return NextResponse.json(result);
}
