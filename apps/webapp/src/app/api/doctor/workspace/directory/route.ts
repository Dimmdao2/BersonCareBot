import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';

/** GET /api/doctor/workspace/directory — read-only current organization members/specialists. */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const context: DoctorWorkspaceContext = {
    organizationId: gate.ctx.organizationId,
    organizationName: null,
    membershipId: gate.ctx.membershipId,
    membershipRole: gate.ctx.membershipRole,
    specialistId: gate.ctx.specialistId,
    canManageOrganization: gate.ctx.canManageOrganization,
    canManageAllSpecialists: gate.ctx.canManageAllSpecialists,
    doctorScreensDisabled: gate.ctx.doctorScreensDisabled,
    selectedSpecialistId: gate.ctx.canManageAllSpecialists ? null : gate.ctx.specialistId,
  };
  const directory = await buildAppDeps().doctorWorkspace.listDirectory(context);
  return NextResponse.json({ ok: true, directory });
}
