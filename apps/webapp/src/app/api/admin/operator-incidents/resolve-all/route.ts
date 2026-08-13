import { NextResponse } from 'next/server';
import { writePlatformAuditLog } from '@/app-layer/admin/auditLog';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';

export async function POST() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const { resolved } = await buildAppDeps().operatorHealthWrite.resolveAllOpenIncidents();

  logger.info({ resolved, actorId: gate.session.user.userId }, 'operator_incidents.resolve_all');

  await writePlatformAuditLog({
    actorId: gate.session.user.userId,
    action: 'operator_incidents_resolve_all',
    details: { resolved },
    status: 'ok',
  });

  return NextResponse.json({ ok: true, resolved });
}
