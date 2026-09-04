import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { isTreatmentProgramExpandNotFoundError } from '@/modules/treatment-program/errors';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const bodySchema = z.object({
  complexTemplateId: z.string().uuid(),
  groupId: z.string().uuid(),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ instanceId: string; stageId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, stageId } = await ctx.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(stageId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst || inst.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const result = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorExpandLfkComplexIntoStage({
        instanceId,
        stageId,
        complexTemplateId: parsed.data.complexTemplateId,
        groupId: parsed.data.groupId,
        actorId: session.user.userId,
      }),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-instances/[instanceId]/stages/[stageId]/items/from-lfk-complex',
      e,
      {
        fallbackCode: 'expand_lfk_complex_failed',
        fallbackStatus: 500,
        domainStatus: () => (isTreatmentProgramExpandNotFoundError(e) ? 404 : 400),
      },
    );
  }
}
