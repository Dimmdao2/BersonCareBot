/**
 * GET /api/doctor/patients/[userId]/clinical
 * → { ok, state: ClinicalState }
 *
 * Read-only проекция продольной медкарты: активные жалобы с severity+трендом,
 * активные диагнозы и их история. Визиты читаются отдельно через /visits.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireDoctorWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const moduleGate = await requireDoctorWorkspaceModuleForApi(deps, gate.ctx, 'medical_record');
  if (!moduleGate.ok) return moduleGate.response;

  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }

  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const patientUserId = identity.userId;

  const state = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.patientClinical.getClinicalState(patientUserId),
  );

  return NextResponse.json({ ok: true, state });
}
