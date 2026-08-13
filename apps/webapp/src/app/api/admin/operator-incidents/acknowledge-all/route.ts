import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/app-layer/admin/auditLog';
import { getPool } from '@/app-layer/db/client';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePlatformOperationsApiContext } from '@/app-layer/guards/requireRole';
import { logger } from '@/app-layer/logging/logger';

export async function POST() {
  const gate = await requirePlatformOperationsApiContext();
  if (!gate.ok) return gate.response;

  const { acknowledged } =
    await buildAppDeps().operatorHealthWrite.acknowledgeOpenOutboundProviderIncidents();
  logger.info(
    { acknowledged, actorId: gate.session.user.userId },
    'operator_incidents.acknowledge_all',
  );
  await writeAuditLog(getPool(), {
    actorId: gate.session.user.userId,
    action: 'operator_incidents_acknowledge_all',
    details: { acknowledged },
    status: 'ok',
  });
  return NextResponse.json({ ok: true, acknowledged });
}
