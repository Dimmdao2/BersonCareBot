import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { emitPackageLinkedCalendarSync } from '@/app-layer/booking/emitPackageCalendarSync';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';

type RouteContext = { params: Promise<{ id: string }> };

// ST-02: bulk «Пересчитать» endpoint over the ST-01 core. Body is minimal — the package id
// comes from the route params; the eligible window/statuses are derived server-side (OQ-5/OQ-7).
export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id: patientPackageId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const memberships = deps.memberships;
  try {
    // IDOR/ownership (OQ-1): organizationId comes from the authenticated gate, and the service
    // loads the package with `getPatientPackage(id, organizationId)` — a package belonging to
    // another org resolves to null → `package_not_found`. Recalc can never touch a foreign package.
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'doctor.booking-engine.patient-packages.recalc',
      () =>
        memberships.recalcPastSessionsForPackageDbPhase({
          organizationId: gate.ctx.organizationId,
          patientPackageId,
          createdByPlatformUserId: gate.ctx.session.user.userId,
        }),
    );
    await memberships.refreshRecalcPastSessionsCalendar(result.appointmentsToRefresh);
    const { summary } = result;
    // Best-effort calendar sync for each newly debited appointment.
    for (const entry of summary.debited) {
      const appointment = await gate.ctx.service.getAppointment(entry.appointmentId);
      if (appointment) {
        await emitPackageLinkedCalendarSync(createBookingSyncPort(), appointment);
      }
    }
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'recalc_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
