/**
 * PATCH /api/doctor/patients/[userId]/visits/[visitId] → { ok }
 *
 * Инлайн-правка текстовых полей визита (осмотр/манипуляции/пробы/рекомендации/локация/
 * длительность). Пустая строка очищает поле. Жалобы/диагнозы/динамику визита не трогает.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

const bodySchema = z
  .object({
    location: z.string().max(500).optional(),
    duration: z.string().max(100).optional(),
    anamnesisText: z.string().max(20000).optional(),
    exam: z.string().max(20000).optional(),
    manipulations: z.string().max(20000).optional(),
    trialResults: z.string().max(20000).optional(),
    recommendations: z.string().max(20000).optional(),
  })
  .refine(
    (b) =>
      b.location !== undefined ||
      b.duration !== undefined ||
      b.anamnesisText !== undefined ||
      b.exam !== undefined ||
      b.manipulations !== undefined ||
      b.trialResults !== undefined ||
      b.recommendations !== undefined,
    { message: 'nothing_to_update' },
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; visitId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId, visitId } = await params;
  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(visitId).success
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
    ok = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.patientClinical.updateVisitFields({
        patientUserId,
        visitId,
        ...parsed.data,
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
