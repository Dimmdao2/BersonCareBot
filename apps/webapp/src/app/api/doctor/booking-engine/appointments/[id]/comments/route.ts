/**
 * GET/POST /api/doctor/booking-engine/appointments/:id/comments
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../_resolveDoctorAppointmentAccess';

const postBodySchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const { id: appointmentId } = await context.params;
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_appointment' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'clinic');
  if (!appointment) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }

  const orgId = gate.ctx.organizationId;
  const comments = await deps.clientHistory.listAppointmentComments(orgId, appointmentId);
  return NextResponse.json({ ok: true, comments });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const { id: appointmentId } = await context.params;
  if (!z.string().uuid().safeParse(appointmentId).success) {
    return NextResponse.json({ ok: false, error: 'invalid_appointment' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = postBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }

  const orgId = gate.ctx.organizationId;
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'own');
  if (!appointment?.platformUserId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const deps = buildAppDeps();
  const platformUserId = appointment.platformUserId;

  try {
    const comment = await withDoctorWorkspacePrincipal(gate.ctx, () =>
      deps.clientHistory.createAppointmentComment({
        organizationId: orgId,
        appointmentId,
        platformUserId,
        authorId: gate.ctx.session.user.userId,
        body: parsed.data.body,
      }),
    );
    return NextResponse.json({ ok: true, comment });
  } catch (e) {
    if (e instanceof Error && e.message === 'empty_comment') {
      return NextResponse.json({ ok: false, error: 'empty_comment' }, { status: 400 });
    }
    throw e;
  }
}
