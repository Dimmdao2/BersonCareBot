import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const completeBodySchema = z
  .object({
    perceivedDifficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    reps: z.number().int().positive().max(5000).optional(),
    sets: z.number().int().positive().max(500).optional(),
    weightKg: z.number().min(0).max(500).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId, itemId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(itemId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let parsedBody: z.infer<typeof completeBodySchema> = {};
  try {
    const rawText = await request.text();
    if (rawText.trim() !== '') {
      const bodyJson = JSON.parse(rawText) as unknown;
      const validated = completeBodySchema.safeParse(bodyJson);
      if (!validated.success) {
        return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
      }
      parsedBody = validated.data;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const detail = await deps.treatmentProgramInstance.getInstanceForPatient(
      gate.session.user.userId,
      instanceId,
    );
    if (!detail?.organizationId) {
      return NextResponse.json({ ok: false, error: 'Программа не найдена' }, { status: 404 });
    }
    const repeatCooldownMinutes = await deps.runtimeConfig.getInteger(
      'patient_treatment_plan_item_done_repeat_cooldown_minutes',
      { patientUserId: gate.session.user.userId, organizationId: detail.organizationId },
    );
    const result = await deps.treatmentProgramProgress.patientCompleteSimpleItem({
      patientUserId: gate.session.user.userId,
      instanceId,
      stageItemId: itemId,
      completion: Object.keys(parsedBody).length > 0 ? parsedBody : undefined,
      repeatCooldownMinutes,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = msg === 'completion_cooldown_active' ? 409 : msg.includes('не найден') ? 404 : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
