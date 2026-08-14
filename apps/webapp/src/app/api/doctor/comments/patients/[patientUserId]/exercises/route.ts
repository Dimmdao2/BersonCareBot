/**
 * GET /api/doctor/comments/patients/:patientUserId/exercises
 *
 * Упражнения выбранного пациента с комментариями, сгруппированные по этапам (state B drill-down).
 * Используется клиентским компонентом DoctorCommentsTab при выборе пациента слева.
 *
 * Query params:
 *   includePastPrograms — "true" для включения прошлых программ (по умолчанию — только активная).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { loadDoctorPatientExercisesWithComments } from '@/app/app/doctor/comments/loadDoctorPatientExercisesWithComments';

const uuidSchema = z.string().uuid();

export async function GET(
  request: Request,
  context: { params: Promise<{ patientUserId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { patientUserId } = await context.params;
  if (!uuidSchema.safeParse(patientUserId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_patient_id' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const includePastPrograms = searchParams.get('includePastPrograms') === 'true';

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    patientUserId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    loadDoctorPatientExercisesWithComments(
      {
        treatmentProgramInstance: deps.treatmentProgramInstance,
        programItemDiscussion: deps.programItemDiscussion,
      },
      {
        patientUserId: identity.userId,
        viewerUserId: gate.ctx.session.user.userId,
        organizationId: gate.ctx.organizationId,
      },
      { includePastPrograms },
    ),
  );

  if (!result) {
    return NextResponse.json({ ok: true, data: null });
  }

  return NextResponse.json({ ok: true, data: result });
}
