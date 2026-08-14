import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

const paramsSchema = z.object({ userId: z.string().uuid() });
const revokeSchema = z.object({ inviteId: z.string().uuid() }).strict();

async function resolvePatient(
  userId: string,
  organizationId: string,
  actor: PatientVisibilityActor,
) {
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    organizationId,
    actor,
  );
  return identity
    ? { deps, patientUserId: identity.userId, invitedEmail: identity.email ?? null }
    : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const state = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    patient.deps.patientInvites.getPortalStatus(gate.ctx.organizationId, patient.patientUserId),
  );
  return NextResponse.json({ ok: true, state });
}

export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_user_id' }, { status: 400 });
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const result = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patient-portal-invite.issue',
    () =>
      patient.deps.patientInvites.issue({
        organizationId: gate.ctx.organizationId,
        patientUserId: patient.patientUserId,
        invitedEmail: patient.invitedEmail,
        createdByPlatformUserId: gate.ctx.session.user.userId,
      }),
  );
  if (!result.ok) {
    const status = result.code === 'already_linked' ? 409 : result.code === 'wrong_org' ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.code }, { status });
  }
  return NextResponse.json({
    ok: true,
    inviteId: result.invite.id,
    expiresAt: result.invite.expiresAt,
    relativeUrl: result.relativeUrl,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const parsed = paramsSchema.safeParse(await params);
  const body = revokeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !body.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const patient = await resolvePatient(parsed.data.userId, gate.ctx.organizationId, gate.ctx);
  if (!patient) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const revoked = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.patient-portal-invite.revoke',
    () =>
      patient.deps.patientInvites.revoke({
        organizationId: gate.ctx.organizationId,
        patientUserId: patient.patientUserId,
        inviteId: body.data.inviteId,
        revokedByPlatformUserId: gate.ctx.session.user.userId,
      }),
  );
  return revoked
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}
