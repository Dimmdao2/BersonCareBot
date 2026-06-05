import { NextResponse } from "next/server";
import { z } from "zod";
import { applyStaffCancelSideEffects } from "@/app-layer/booking/staffAppointmentLifecycleEffects";
import {
  resolveRubitimeIdForAppointment,
  syncStaffCancelToRubitime,
} from "@/app-layer/booking/staffRubitimeMirrorOutbound";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

const bodySchema = z.object({
  decisionType: z.enum([
    "free",
    "penalized",
    "package_charged",
    "no_package_charge",
    "retain_prepayment",
    "refund_prepayment",
    "custom",
  ]),
  reason: z.string().trim().max(400).optional(),
  staffComment: z.string().trim().max(1000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingAppointmentLifecycle) {
    return NextResponse.json({ ok: false, error: "lifecycle_unavailable" }, { status: 503 });
  }
  const bookingRow = deps.patientBooking
    ? await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId)
    : null;
  const rubitimeId = await resolveRubitimeIdForAppointment({
    appointmentId,
    organizationId: gate.ctx.organizationId,
    bookingRow,
    getRubitimeAppointmentId: gate.ctx.service.getRubitimeAppointmentId,
  });
  const syncPort = createBookingSyncPort();
  const result = await deps.bookingAppointmentLifecycle.staffCancel({
    appointmentId,
    organizationId: gate.ctx.organizationId,
    actorType: "admin",
    actorId: gate.ctx.session.user.userId,
    decisionType: parsed.data.decisionType,
    reason: parsed.data.reason,
    staffComment: parsed.data.staffComment,
    manualOverride: true,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  if (rubitimeId) {
    try {
      await syncStaffCancelToRubitime({
        rubitimeId,
        appointmentId,
        appointmentMirrorSync: deps.appointmentMirrorSync,
        syncPort,
      });
    } catch {
      return NextResponse.json({ ok: false, error: "rubitime_sync_failed" }, { status: 502 });
    }
  }
  const { loadBookingLifecycleNotificationsFromSystemSettings } = await import(
    "@/modules/booking-notifications/settings"
  );
  const lifecycleNotificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => deps.systemSettings.getSetting(key, scope),
  );
  if (deps.memberships) {
    try {
      await deps.memberships.applyCancelPackageOutcome({
        appointmentId,
        organizationId: gate.ctx.organizationId,
        packageLessonDeducted: parsed.data.decisionType === "package_charged",
        createdByPlatformUserId: gate.ctx.session.user.userId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "package_outcome_failed";
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
  }
  if (deps.payments) {
    await deps.payments.applyCancelPaymentOutcome({
      appointmentId,
      organizationId: gate.ctx.organizationId,
      prepaymentRetained: parsed.data.decisionType === "retain_prepayment",
      prepaymentRefunded: parsed.data.decisionType === "refund_prepayment",
      reason: parsed.data.reason,
    });
  }
  await applyStaffCancelSideEffects({
    projection: deps.appointmentProjection,
    lifecycle: deps.bookingAppointmentLifecycle,
    organizationId: gate.ctx.organizationId,
    appointment: result.appointment,
    cancelPolicy: result.cancelPolicy,
    syncPort,
    bookingRow,
    lifecycleNotificationSettings,
  });
  return NextResponse.json({ ok: true, appointment: result.appointment });
}
