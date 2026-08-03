import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/app-layer/admin/auditLog';
import { getPool } from '@/app-layer/db/client';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  requireAdminApiContext,
  requireDoctorWorkspaceApiContext,
} from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';

export async function POST() {
  const gate = await requireAdminApiContext();
  if (!gate.ok) return gate.response;
  const workspaceGate = await requireDoctorWorkspaceApiContext();
  if (!workspaceGate.ok) return workspaceGate.response;

  const { resolved } = await buildAppDeps().operatorHealthWrite.resolveAllOpenIncidents();

  logger.info({ resolved, actorId: gate.session.user.userId }, 'operator_incidents.resolve_all');

  await withDoctorWorkspacePrincipal(workspaceGate.ctx, () =>
    writeAuditLog(getPool(), {
      actorId: gate.session.user.userId,
      action: 'operator_incidents_resolve_all',
      details: { resolved },
      status: 'ok',
    }),
  );

  return NextResponse.json({ ok: true, resolved });
}
