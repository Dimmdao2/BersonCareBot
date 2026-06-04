import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { emitPackageCalendarSync } from "@/app-layer/booking/emitPackageCalendarSync";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { withDefaultCancellationPolicy } from "@/modules/booking-policies/service";
import type { PackageDetachOutcome } from "@/modules/memberships/service";
import { membershipErrorResponse } from "./patientPackagesRouteShared";

const DETACH_ERROR_STATUS: Record<string, number> = {
  appointment_not_found: 404,
  appointment_not_linked_to_package: 400,
  appointment_has_consumed_package_session: 400,
  past_unlink_not_allowed: 403,
  past_detach_confirmation_required: 400,
  late_detach_choice_required: 409,
};

export async function runPackageDetach(params: {
  organizationId: string;
  appointmentId: string;
  createdByPlatformUserId: string | null;
  outcome?: PackageDetachOutcome;
  confirmPastTwice?: boolean;
}) {
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: "memberships_unavailable" }, { status: 503 });
  }

  const appt = await deps.bookingEngine.getAppointment(params.appointmentId);
  if (!appt) {
    return NextResponse.json({ ok: false, error: "appointment_not_found" }, { status: 404 });
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
    "booking_allow_doctor_unlink_past_package_sessions",
    "admin",
  );
  const allowPastUnlink =
    allowPastRow?.valueJson === true ||
    (typeof allowPastRow?.valueJson === "object" &&
      allowPastRow?.valueJson !== null &&
      "value" in (allowPastRow.valueJson as object) &&
      (allowPastRow.valueJson as { value?: unknown }).value === true);

  try {
    const result = await deps.memberships.detachAppointmentPackage({
      organizationId: params.organizationId,
      appointmentId: params.appointmentId,
      createdByPlatformUserId: params.createdByPlatformUserId,
      outcome: params.outcome,
      confirmPastTwice: params.confirmPastTwice,
      allowPastUnlink,
      freeCancelHoursBefore: policy.freeCancelHoursBefore,
    });
    const appointment = await deps.bookingEngine.getAppointment(params.appointmentId);
    if (appointment) {
      await emitPackageCalendarSync({
        syncPort: createBookingSyncPort(),
        appointment,
        eventType: "booking.package_unlinked",
      });
    }
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "detach_failed";
    const status = DETACH_ERROR_STATUS[msg] ?? 400;
    if (status === 400 && msg !== "detach_failed") {
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    return membershipErrorResponse(e);
  }
}
