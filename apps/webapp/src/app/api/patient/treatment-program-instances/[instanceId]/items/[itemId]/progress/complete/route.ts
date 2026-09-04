import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';
import { PATIENT_PROGRAM_NOT_FOUND_MESSAGE } from '@/modules/treatment-program/patient-program-actions';

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
      // Текст для человека живёт в `message` — там же, куда его кладёт общая дверь, поэтому
      // экран на «голом» fetch читает оба отказа одним `readSafeApiErrorText`.
      return NextResponse.json(
        { ok: false, error: 'not_found', message: PATIENT_PROGRAM_NOT_FOUND_MESSAGE },
        { status: 404 },
      );
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
    return respondWithSafeApiError(
      'api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete',
      e,
      {
        fallbackCode: 'progress_complete_failed',
        fallbackStatus: 500,
        domainStatus: (text) =>
          text === 'completion_cooldown_active' ? 409 : text.includes('не найден') ? 404 : 400,
      },
    );
  }
}
