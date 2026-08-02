import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { emitPackageLinkedCalendarSync } from '@/app-layer/booking/emitPackageCalendarSync';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';

const bodySchema = z.object({
  patientPackageItemId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id: patientPackageId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  try {
    const usage = await deps.memberships.manualConsume(
      {
        organizationId: gate.ctx.organizationId,
        patientPackageId,
        patientPackageItemId: parsed.data.patientPackageItemId,
        appointmentId: parsed.data.appointmentId ?? null,
        createdByPlatformUserId: gate.ctx.session.user.userId,
      },
      {
        runMembershipWrite: (fn) =>
          withDoctorWorkspacePrincipal(
            gate.ctx,
            'doctor.booking-engine.patient-packages.consume',
            fn,
          ),
      },
    );
    if (parsed.data.appointmentId) {
      const appointment = await gate.ctx.service.getAppointment(parsed.data.appointmentId);
      if (appointment) {
        await emitPackageLinkedCalendarSync(createBookingSyncPort(), appointment);
      }
    }
    return NextResponse.json({ ok: true, usage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'consume_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
