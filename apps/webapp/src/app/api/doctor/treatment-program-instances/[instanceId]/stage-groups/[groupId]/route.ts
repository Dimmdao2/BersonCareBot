import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z.object({
  title: z.string().min(1).max(2000).optional(),
  description: z.string().max(10000).optional().nullable(),
  scheduleText: z.string().max(5000).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(
  request: Request,
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

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
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
    const group = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.doctorUpdateInstanceStageGroup({
        instanceId,
        groupId,
        actorId: session.user.userId,
        patch: parsed.data,
      }),
    );
    return NextResponse.json({ ok: true, group });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]',
      e,
      {
        fallbackCode: 'treatment_program_instances_stage_groups_failed',
        fallbackStatus: 500,
        domainStatus: doctorTreatmentProgramInstanceRouteErrorStatus,
      },
    );
  }
}

export async function DELETE(
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
      deps.treatmentProgramInstance.doctorDeleteInstanceStageGroup({
        instanceId,
        groupId,
        actorId: session.user.userId,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondWithSafeApiError(
      'api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]',
      e,
      {
        fallbackCode: 'treatment_program_instances_stage_groups_failed',
        fallbackStatus: 500,
        domainStatus: doctorTreatmentProgramInstanceRouteErrorStatus,
      },
    );
  }
}
