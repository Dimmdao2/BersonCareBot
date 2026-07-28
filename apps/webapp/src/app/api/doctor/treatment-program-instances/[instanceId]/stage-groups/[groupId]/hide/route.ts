import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { revalidatePatientTreatmentProgramUi } from '@/app-layer/cache/revalidatePatientTreatmentProgramUi';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string; groupId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId, groupId } = await context.params;
  if (
    !z.string().uuid().safeParse(instanceId).success ||
    !z.string().uuid().safeParse(groupId).success
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
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
    await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorHideInstanceStageGroup({
        instanceId,
        groupId,
        actorId: session.user.userId,
      }),
    );
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = doctorTreatmentProgramInstanceRouteErrorStatus(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
