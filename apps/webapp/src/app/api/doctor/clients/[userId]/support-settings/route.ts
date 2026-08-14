/**
 * GET/PATCH /api/doctor/clients/:userId/support-settings — «На сопровождении» и гейты комментариев/медиа.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';

const patchBodySchema = z.object({
  onSupport: z.boolean().optional(),
  commentsEnabled: z.boolean().nullable().optional(),
  mediaEnabled: z.boolean().nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
    gate.ctx,
  );
  if (!identity) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

  const [profile, policy] = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    Promise.all([
      deps.doctorClients.getClientSupport(identity.userId),
      deps.doctorClients.getPatientProgramInteractionPolicy(identity.userId),
    ]),
  );

  return NextResponse.json({
    ok: true,
    profile: profile ?? {
      patientUserId: identity.userId,
      onSupport: false,
      commentsEnabled: null,
      mediaEnabled: null,
      updatedAt: null,
      updatedBy: null,
    },
    effectivePolicy: policy,
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const { session } = gate.ctx;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
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

  const profile = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorClients.updateClientSupport({
      patientUserId: identity.userId,
      ...parsed.data,
      actorId: session.user.userId,
    }),
  );
  const effectivePolicy = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.doctorClients.getPatientProgramInteractionPolicy(identity.userId),
  );

  return NextResponse.json({ ok: true, profile, effectivePolicy });
}
