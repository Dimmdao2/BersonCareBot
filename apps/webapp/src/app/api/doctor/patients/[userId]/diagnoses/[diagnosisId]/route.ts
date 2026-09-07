/**
 * PATCH /api/doctor/patients/[userId]/diagnoses/[diagnosisId] → { ok }
 *
 * Правка текста, комментария и приоритета диагноза вне визита.
 * Клинический статус меняется отдельным status-route.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const bodySchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    priority: z.boolean().optional(),
    comment: z.string().max(5000).nullable().optional(),
  })
  .refine((b) => b.text !== undefined || b.priority !== undefined || b.comment !== undefined, {
    message: 'nothing_to_update',
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; diagnosisId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const moduleGate = await requireWorkspaceModuleForApi(
    gate.ctx,
    'medical_record',
    deps.systemSettings,
  );
  if (!moduleGate.ok) return moduleGate.response;

  const { userId, diagnosisId } = await params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(diagnosisId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  let ok: boolean;
  try {
    ok = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.patients.clinical.diagnosis.update',
      () =>
        deps.patientClinical.updateDiagnosisFields({
          patientUserId,
          diagnosisId,
          text: parsed.data.text,
          priority: parsed.data.priority,
          comment: parsed.data.comment,
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
