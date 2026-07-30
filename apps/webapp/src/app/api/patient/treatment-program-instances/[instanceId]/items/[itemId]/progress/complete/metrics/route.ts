import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

function validateIds(instanceId: string, itemId: string): boolean {
  return (
    z.string().uuid().safeParse(instanceId).success && z.string().uuid().safeParse(itemId).success
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (!validateIds(instanceId, itemId)) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const metrics = await deps.treatmentProgramProgress.getLatestSimpleCompletionMetrics({
    patientUserId: gate.session.user.userId,
    instanceId,
    stageItemId: itemId,
  });
  return NextResponse.json({ ok: true, metrics });
}
