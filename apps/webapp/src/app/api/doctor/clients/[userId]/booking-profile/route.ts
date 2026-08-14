/**
 * GET/PATCH /api/doctor/clients/:userId/booking-profile — booking-репутация (отдельно от messaging block).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import type { PatientVisibilityActor } from '@/modules/patient-visibility/ports';

const patchBodySchema = z.object({
  isProblematic: z.boolean().optional(),
  bookingBlocked: z.boolean().optional(),
  problematicNote: z.string().max(2000).nullable().optional(),
});

async function resolveClient(
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
  if (!identity)
    return { error: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }) };
  if (!deps.bookingEngine) {
    return {
      error: NextResponse.json({ ok: false, error: 'booking_unavailable' }, { status: 503 }),
    };
  }
  return { deps };
}

export async function GET(_request: Request, context: { params: Promise<{ userId: string }> }) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_user' }, { status: 400 });
  }

  const resolved = await resolveClient(userId, gate.ctx.organizationId, gate.ctx);
  if ('error' in resolved && resolved.error) return resolved.error;
  const { deps } = resolved as { deps: ReturnType<typeof buildAppDeps> };

  const profile = await deps.clientHistory.getBookingProfile(gate.ctx.organizationId, userId);
  return NextResponse.json({
    ok: true,
    profile: profile ?? {
      platformUserId: userId,
      organizationId: gate.ctx.organizationId,
      isProblematic: false,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: null,
      updatedBy: null,
    },
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

  const resolved = await resolveClient(userId, gate.ctx.organizationId, gate.ctx);
  if ('error' in resolved && resolved.error) return resolved.error;
  const { deps } = resolved as { deps: ReturnType<typeof buildAppDeps> };

  const profile = await withDoctorWorkspacePrincipal(gate.ctx, () =>
    deps.clientHistory.upsertBookingProfile({
      organizationId: gate.ctx.organizationId,
      platformUserId: userId,
      ...parsed.data,
      updatedBy: session.user.userId,
    }),
  );

  return NextResponse.json({ ok: true, profile });
}
