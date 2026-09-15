import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

type RouteContext = { params: Promise<{ userId: string }> };

/** Visible refusal marks for either account in the reviewed pair, scoped to the doctor's clinic. */
export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const refusals = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    service.listMedicalConflictRefusalsForUser(gate.ctx.organizationId, userId),
  );
  return NextResponse.json({ ok: true, refusals });
}
