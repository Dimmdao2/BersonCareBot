import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

const actionSchema = z.object({ action: z.enum(['merge', 'refuse']) }).strict();
const uuidSchema = z.string().uuid();

type RouteContext = { params: Promise<{ conflictId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conflictId } = await context.params;
  if (!uuidSchema.safeParse(conflictId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_conflict' }, { status: 400 });
  }
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const conflict = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    service.readMedicalConflictDetails(gate.ctx.organizationId, conflictId),
  );
  if (!conflict) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, conflict });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { conflictId } = await context.params;
  const body = (await request.json().catch(() => null)) as unknown;
  const parsedId = uuidSchema.safeParse(conflictId);
  const parsedBody = actionSchema.safeParse(body);
  if (!parsedId.success || !parsedBody.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }
  const service = buildAppDeps().patientMergeCandidate;
  if (!service) {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
  const actorId = gate.ctx.session.user.userId;
  const resolved = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    parsedBody.data.action === 'merge'
      ? service.mergeMedicalConflict(gate.ctx.organizationId, conflictId, actorId)
      : service.refuseMedicalConflict(gate.ctx.organizationId, conflictId, actorId),
  );
  if (!resolved) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ ok: true, action: parsedBody.data.action });
}
