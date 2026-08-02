/**
 * PATCH/DELETE /api/doctor/tasks/:taskId
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
import { specialistTaskPatchSchema } from '@/modules/specialist-tasks/apiSchemas';

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('specialist_tasks', 'изменить задачу');
  }

  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_task' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = specialistTaskPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const existing = await deps.specialistTasks.getByIdForOwner(taskId, session.user.userId);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const clearReminderSent =
    parsed.data.remindAt !== undefined && parsed.data.remindAt !== existing.remindAt;

  try {
    const task = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.specialistTasks.update(taskId, session.user.userId, {
        ...parsed.data,
        clearReminderSent,
      }),
    );
    if (!task) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, task });
  } catch (e) {
    if (e instanceof Error && e.message === 'empty_title') {
      return NextResponse.json({ ok: false, error: 'empty_title' }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('specialist_tasks', 'удалить задачу');
  }

  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_task' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const existing = await deps.specialistTasks.getByIdForOwner(taskId, session.user.userId);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const deleted = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.specialistTasks.delete(taskId, session.user.userId),
  );
  if (!deleted) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
