import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

/** One organization-scoped read for the Today/Clients indicators. */
export async function GET() {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const summary = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    service.medicalConflictSummary(gate.ctx.organizationId),
  );
  return NextResponse.json({ ok: true, ...summary });
}
