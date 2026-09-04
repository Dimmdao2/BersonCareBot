import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { revalidatePatientTreatmentProgramUi } from '@/app-layer/cache/revalidatePatientTreatmentProgramUi';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patient });
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const { recorded } = await deps.treatmentProgramInstance.patientRecordPlanOpened({
      patientUserId: gate.session.user.userId,
      instanceId,
    });
    if (recorded) {
      revalidatePatientTreatmentProgramUi();
    }
    return NextResponse.json({ ok: true, recorded });
  } catch (e) {
    return respondWithSafeApiError(
      'api/patient/treatment-program-instances/[instanceId]/plan-opened',
      e,
      {
        fallbackCode: 'treatment_program_instances_plan_opened_failed',
        fallbackStatus: 500,
        domainStatus: (text) => (text.includes('не найден') ? 404 : 400),
      },
    );
  }
}
