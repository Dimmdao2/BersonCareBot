import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { PATIENT_PROGRAM_NOT_FOUND_MESSAGE } from '@/modules/treatment-program/patient-program-actions';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

export async function GET(_request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const stats = await deps.treatmentProgramPatientActions.getPatientPlanPassageStats(
      gate.session.user.userId,
      instanceId,
    );
    return NextResponse.json({ ok: true, stats });
  } catch (e) {
    return respondWithSafeApiError(
      'api/patient/treatment-program-instances/[instanceId]/passage-stats',
      e,
      {
        fallbackCode: 'treatment_program_instances_passage_stats_failed',
        fallbackStatus: 500,
        // Явная ветка доменного контракта, а не поиск подстроки в тексте пойманного исключения.
        domainStatus: (text) => (text === PATIENT_PROGRAM_NOT_FOUND_MESSAGE ? 404 : 400),
      },
    );
  }
}
