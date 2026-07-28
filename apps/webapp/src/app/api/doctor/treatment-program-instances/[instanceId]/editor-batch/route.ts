import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { instanceEditorBatchBodySchema } from '@/modules/treatment-program/instanceEditorBatchSchema';
import { revalidatePatientTreatmentProgramUi } from '@/app-layer/cache/revalidatePatientTreatmentProgramUi';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';

export async function POST(request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = instanceEditorBatchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst0 = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst0 || inst0.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst0.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    }

    const item = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorApplyInstanceEditorBatch({
        instanceId,
        actorId: session.user.userId,
        draft: parsed.data.draft,
      }),
    );
    revalidatePatientTreatmentProgramUi();
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error';
    const status = doctorTreatmentProgramInstanceRouteErrorStatus(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
