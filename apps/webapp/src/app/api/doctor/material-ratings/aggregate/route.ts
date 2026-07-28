import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { MaterialRatingAccessError } from '@/modules/material-rating/types';

const querySchema = z.object({
  kind: z.enum(['content_page', 'lfk_exercise', 'lfk_complex']),
  id: z.string().uuid(),
});

export async function GET(request: Request) {
  const auth = await requireDoctorWorkspaceApiContext();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();
  try {
    const aggregate = await deps.materialRating.getPublicAggregate({
      organizationId: auth.ctx.organizationId,
      targetKind: parsed.data.kind,
      targetId: parsed.data.id,
      excludedUserIds: audience.excludedUserIds,
    });
    return NextResponse.json({
      ok: true,
      avg: aggregate.avg,
      count: aggregate.count,
      distribution: aggregate.distribution,
    });
  } catch (e) {
    if (e instanceof MaterialRatingAccessError) {
      return NextResponse.json({ ok: false, error: e.accessCode }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
}
