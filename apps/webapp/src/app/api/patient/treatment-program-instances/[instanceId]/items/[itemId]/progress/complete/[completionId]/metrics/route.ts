import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';

const metricsSchema = z
  .object({
    perceivedDifficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    reps: z.number().int().positive().max(5000).optional(),
    sets: z.number().int().positive().max(500).optional(),
    weightKg: z.number().min(0).max(500).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ instanceId: string; itemId: string; completionId: string }>;
  },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;
  const { instanceId, itemId, completionId } = await context.params;
  const uuid = z.string().uuid();
  if (![instanceId, itemId, completionId].every((id) => uuid.safeParse(id).success)) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }
  const parsed = metricsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  try {
    const metrics = await buildAppDeps().treatmentProgramProgress.enrichSimpleCompletion({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      completionId,
      metrics: parsed.data,
    });
    return NextResponse.json({ ok: true, metrics });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'error';
    const status = message.includes('not_found') || message.includes('не найден') ? 404 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
