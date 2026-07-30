/**
 * PATCH /api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status
 *
 * Изменить клинический статус диагноза: предварительный → подтверждённый → закрытый.
 * Пишет строку в audit-log (clinical_diagnosis_status_history).
 *
 * Body: { status: DiagnosisClinicalStatus, note?: string }
 *
 * GET /api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status
 *
 * Вернуть историю изменений клинического статуса.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DIAGNOSIS_CLINICAL_STATUS_VALUES } from '@/modules/patient-clinical/ports';

const patchBodySchema = z.object({
  status: z.enum(DIAGNOSIS_CLINICAL_STATUS_VALUES as [string, ...string[]]),
  note: z.string().max(1000).nullable().optional(),
});

const uuidSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; diagnosisId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, diagnosisId } = await params;
  if (!uuidSchema.safeParse(userId).success || !uuidSchema.safeParse(diagnosisId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  let ok: boolean;
  try {
    ok = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.patients.clinical.diagnosis-status.update',
      () =>
        deps.patientClinical.setDiagnosisClinicalStatus({
          patientUserId,
          diagnosisId,
          newStatus: parsed.data.status as (typeof DIAGNOSIS_CLINICAL_STATUS_VALUES)[number],
          changedBy: gate.ctx.session.user.userId,
          note: parsed.data.note ?? null,
        }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'organization_principal_mismatch') {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    throw error;
  }

  if (!ok) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string; diagnosisId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, diagnosisId } = await params;
  if (!uuidSchema.safeParse(userId).success || !uuidSchema.safeParse(diagnosisId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  const history = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientClinical.getDiagnosisStatusHistory(patientUserId, diagnosisId),
  );

  return NextResponse.json({ ok: true, history });
}
