/**
 * POST /api/doctor/tasks/:taskId/complete
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

export async function POST(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const entitlement = await requireEntitlementForMutation(gate.ctx, 'specialist_tasks');
  if (!entitlement.ok) {
    return entitlementMutationRefusalResponse('specialist_tasks', 'выполнить задачу');
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
  const task = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.specialistTasks.complete(taskId, session.user.userId),
  );
  if (!task) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, task });
}
