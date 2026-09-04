import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';
const postBodySchema = z.object({
  title: z.string().min(1).max(2000),
  description: z.string().max(20000).optional().nullable(),
  sortOrder: z.number().int().optional(),
  status: z.enum(['locked', 'available', 'in_progress', 'completed', 'skipped']).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
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
    const stage = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorAddStage({
        instanceId,
        actorId: session.user.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        sortOrder: parsed.data.sortOrder,
        status: parsed.data.status,
      }),
    );
    return NextResponse.json({ ok: true, stage });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-instances/[instanceId]/stages',
      e,
      {
        fallbackCode: 'treatment_program_instances_stages_failed',
        fallbackStatus: 500,
        domainStatus: doctorTreatmentProgramInstanceRouteErrorStatus,
      },
    );
  }
}
