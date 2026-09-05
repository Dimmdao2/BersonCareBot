import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { emitPackageCalendarSync } from '@/app-layer/booking/emitPackageCalendarSync';
import { createBookingSyncPort } from '@/modules/integrator/bookingM2mApi';
import { withDefaultCancellationPolicy } from '@/modules/booking-policies/service';
import type { PackageDetachOutcome } from '@/modules/memberships/service';
import { membershipErrorResponse } from './patientPackagesRouteShared';


export async function runPackageDetach(params: {
  organizationId: string;
  appointmentId: string;
  createdByPlatformUserId: string | null;
  outcome?: PackageDetachOutcome;
  confirmPastTwice?: boolean;
  runDetachMutation?: <T>(fn: () => Promise<T>) => Promise<T>;
}) {
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }

  const appt = await deps.bookingEngine.getAppointment(params.appointmentId);
  if (!appt) {
    return NextResponse.json({ ok: false, error: 'appointment_not_found' }, { status: 404 });
  }

  const policyCtx = {
    organizationId: params.organizationId,
    specialistId: appt.specialistId,
    serviceId: appt.serviceId,
    productId: null,
  };
  const resolved = await deps.bookingPolicies?.resolveCancellationPolicy(policyCtx);
  const policy = withDefaultCancellationPolicy(resolved ?? null, params.organizationId);

  const allowPastRow = await deps.systemSettings?.getSetting(
    'booking_allow_doctor_unlink_past_package_sessions',
    'admin',
  );
  const allowPastUnlink =
    allowPastRow?.valueJson === true ||
    (typeof allowPastRow?.valueJson === 'object' &&
      allowPastRow?.valueJson !== null &&
      'value' in (allowPastRow.valueJson as object) &&
      (allowPastRow.valueJson as { value?: unknown }).value === true);

  try {
    const detach = () =>
      deps.memberships!.detachAppointmentPackage({
        organizationId: params.organizationId,
        appointmentId: params.appointmentId,
        createdByPlatformUserId: params.createdByPlatformUserId,
        outcome: params.outcome,
        confirmPastTwice: params.confirmPastTwice,
        allowPastUnlink,
        freeCancelHoursBefore: policy.freeCancelHoursBefore,
      });
    const result = params.runDetachMutation
      ? await params.runDetachMutation(detach)
      : await detach();
    const appointment = await deps.bookingEngine.getAppointment(params.appointmentId);
    if (appointment) {
      await emitPackageCalendarSync({
        syncPort: createBookingSyncPort(),
        appointment,
        eventType: 'booking.package_unlinked',
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // Detach codes are a subset of the membership allowlist, so the shared door already keeps each
    // of them distinct with its declared status; the local duplicate map only re-stated four of
    // them and passed everything else — including raw PostgreSQL text — through the same helper.
    return membershipErrorResponse(e);
  }
}
