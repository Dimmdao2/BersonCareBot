import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const bodySchema = z.object({
  severity: z.number().int().min(0).max(10),
  note: z.string().max(5000).nullable().optional(),
  resolved: z.boolean().default(false),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string; complaintId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { userId, complaintId } = await params;
  const uuid = z.string().uuid();
  if (!uuid.safeParse(userId).success || !uuid.safeParse(complaintId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_id' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patients.clinical.complaint.update',
    () =>
      deps.patientClinical.appendComplaintUpdate({
        patientUserId: identity.userId,
        complaintId,
        ...parsed.data,
      }),
  );
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}
