import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { logger } from '@/infra/logging/logger';
import { PRODUCT_ANALYTICS_ENTRY_CHANNELS } from '@/modules/product-analytics/types';

const bodySchema = z.object({
  pushTrackingId: z.string().uuid(),
  entryChannel: z.enum(PRODUCT_ANALYTICS_ENTRY_CHANNELS).optional(),
});

/** POST /api/patient/analytics/push-open — idempotent push click (SW / PWA). */
export async function POST(request: Request) {
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

  try {
    const deps = buildAppDeps();
    const result = await deps.productAnalytics.recordPushOpen({
      pushTrackingId: parsed.data.pushTrackingId,
      userId: gate.session.user.userId,
      entryChannel: parsed.data.entryChannel ?? 'pwa',
    });
    return NextResponse.json({ ok: true, deduped: result.deduped });
  } catch (err) {
    logger.error(
      { err, event: 'patient_push_open_ingest_failed', userId: gate.session.user.userId },
      'patient push-open analytics ingest failed',
    );
    return NextResponse.json({ ok: false, error: 'ingest_failed' }, { status: 500 });
  }
}
