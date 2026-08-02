/**
 * GET/POST /api/doctor/clients/:userId/tasks — задачи по пациенту.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { specialistTaskBodySchema } from '@/modules/specialist-tasks/apiSchemas';

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const includeCompleted = new URL(request.url).searchParams.get('includeCompleted') === '1';
  const tasks = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.specialistTasks.listPatientTasks(session.user.userId, identity.userId, includeCompleted),
  );
  return NextResponse.json({ ok: true, tasks });
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('specialist_tasks', 'создать задачу');
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = specialistTaskBodySchema.omit({ patientUserId: true }).safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  try {
    const task = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.specialistTasks.create({
        ownerUserId: session.user.userId,
        patientUserId: identity.userId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        dueAt: parsed.data.dueAt ?? null,
        remindAt: parsed.data.remindAt ?? null,
        isImportant: parsed.data.isImportant ?? false,
      }),
    );
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === 'empty_title') {
      return NextResponse.json({ ok: false, error: 'empty_title' }, { status: 400 });
    }
    throw e;
  }
}
