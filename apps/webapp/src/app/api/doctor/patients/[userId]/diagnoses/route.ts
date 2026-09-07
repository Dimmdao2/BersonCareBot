import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { requireWorkspaceModuleForApi } from '@/app-layer/guards/workspaceModuleAccess';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const bodySchema = z.object({
  text: z.string().min(1).max(2000),
  priority: z.boolean().default(false),
  comment: z.string().max(5000).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  const moduleGate = await requireWorkspaceModuleForApi(
    gate.ctx,
    'medical_record',
    deps.systemSettings,
  );
  if (!moduleGate.ok) return moduleGate.response;
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const id = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patients.clinical.diagnosis.create',
    () => deps.patientClinical.createDiagnosis({ patientUserId: identity.userId, ...parsed.data }),
  );
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
