/**
 * PATCH /api/doctor/patients/[userId]/diagnoses/[diagnosisId] → { ok }
 *
 * Инлайн-правка атрибутов диагноза (исправление текста / переключение приоритета).
 * НЕ меняет клинический статус — уточнение/снятие выполняются только через визит.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const bodySchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    priority: z.boolean().optional(),
    comment: z.string().max(500).nullable().optional(),
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
