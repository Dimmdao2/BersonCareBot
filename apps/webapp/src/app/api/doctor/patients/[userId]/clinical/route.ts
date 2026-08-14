/**
 * GET /api/doctor/patients/[userId]/clinical
 * → { ok, state: ClinicalState, visits: Visit[] }
 *
 * Read-only проекция раздела «Карта»: актуальное состояние (активные жалобы с
 * severity+тренд, активные диагнозы) + история визитов. Запись — POST .../visits.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
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
  const patientUserId = identity.userId;

  const [state, visits] = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    Promise.all([
      deps.patientClinical.getClinicalState(patientUserId),
      deps.patientClinical.listVisits(patientUserId),
    ]),
  );

  return NextResponse.json({ ok: true, state, visits });
}
