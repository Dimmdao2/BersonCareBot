/**
 * GET /api/doctor/clients/:userId/history — booking timeline, payments, visits.
 * PATCH не используется; профиль репутации — /booking-profile.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';

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
  if (!identity) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: 'booking_unavailable' }, { status: 503 });
  }

  const [timeline, payments, visits] = await Promise.all([
    deps.clientHistory.listTimeline(gate.ctx.organizationId, identity.userId),
    deps.clientHistory.listPaymentHistory(gate.ctx.organizationId, identity.userId),
    deps.clientHistory.listVisitHistory(gate.ctx.organizationId, identity.userId),
  ]);

  return NextResponse.json({ ok: true, timeline, payments, visits });
}
