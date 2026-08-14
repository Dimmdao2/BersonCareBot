/**
 * PATCH /api/doctor/clients/:userId/archive — архив / снятие архива (врач или админ).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  applyClientArchiveChange,
  clientArchiveBodySchema,
} from '@/modules/doctor-clients/clientArchiveChange';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = clientArchiveBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  return applyClientArchiveChange(userId, parsed.data.archived);
}
