import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { doctorTreatmentProgramInstanceRouteErrorStatus } from '@/modules/treatment-program/doctorInstanceRouteErrorStatus';
import { resolveDoctorInstanceInWorkspace } from '../_doctorInstanceWorkspace';
import { respondWithSafeApiError } from '@/app-layer/errors/safeUserError';

const patchBodySchema = z
  .object({
    title: z.string().min(1).max(2000).optional(),
    status: z.enum(['active', 'completed']).optional(),
  })
  .refine((b) => b.title !== undefined || b.status !== undefined, { message: 'empty_patch' });

export async function GET(_request: Request, context: { params: Promise<{ instanceId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const resolved = await resolveDoctorInstanceInWorkspace(deps, gate.ctx, instanceId);
  if (!resolved.ok) return resolved.response;

  return NextResponse.json({ ok: true, item: resolved.instance });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
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
    const item = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.treatmentProgramInstance.updateInstance({
        instanceId,
        title: parsed.data.title,
        status: parsed.data.status,
        actorId: session.user.userId,
      }),
    );
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return respondWithSafeApiError('api/doctor/treatment-program-instances/[instanceId]', e, {
      fallbackCode: 'doctor_treatment_program_instances_failed',
      fallbackStatus: 500,
      domainStatus: doctorTreatmentProgramInstanceRouteErrorStatus,
    });
  }
}
