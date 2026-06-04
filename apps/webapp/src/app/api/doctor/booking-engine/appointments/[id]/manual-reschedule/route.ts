import { NextResponse } from "next/server";
import { z } from "zod";
import { applyStaffRescheduleSideEffects } from "@/app-layer/booking/staffAppointmentLifecycleEffects";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import { requireDoctorBookingEngine } from "../../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  newStartAt: z.string().min(1),
  newEndAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  reason: z.string().trim().max(400).optional(),
  staffComment: z.string().trim().max(1000).optional(),
  branchId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

const RUBITIME_CONFLICT_ERRORS = new Set([
  "slot_already_taken",
  "duplicate_local_booking_id",
  "rubitime_slot_conflict",
  "external_slot_taken",
]);

function isExternalSlotConflict(error: string): boolean {
  return RUBITIME_CONFLICT_ERRORS.has(error);
}

function isSlotOverlapError(err: unknown): boolean {
  if (err instanceof Error && err.message === "slot_overlap") return true;
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
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
  const beforeAppointment = await gate.ctx.service.getAppointment(appointmentId);
  if (!beforeAppointment) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const actorType = gate.ctx.session.user.role === "admin" ? "admin" : "specialist";
  const syncPort = createBookingSyncPort();
  const bookingRow = deps.patientBooking
    ? await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId)
    : null;
  const rubitimeId =
    bookingRow?.rubitimeId ??
    (gate.ctx.service.getRubitimeAppointmentId
      ? await gate.ctx.service.getRubitimeAppointmentId({
          organizationId: gate.ctx.organizationId,
          appointmentId,
        })
      : null);
  let syncedExternally = false;
  const rollbackExternalReschedule = async () => {
    if (!syncedExternally || !rubitimeId || !syncPort.updateRecord) return;
    try {
      await syncPort.updateRecord({
        rubitimeId,
        slotStart: beforeAppointment.startAt,
        slotEnd: beforeAppointment.endAt,
      });
    } catch {
      // Best-effort external rollback when canonical reschedule is rejected.
    }
  };
  if (rubitimeId && syncPort.updateRecord) {
    try {
      await syncPort.updateRecord({
        rubitimeId,
        slotStart: parsed.data.newStartAt,
        slotEnd: parsed.data.newEndAt,
      });
      syncedExternally = true;
    } catch (syncErr) {
      const syncCode = syncErr instanceof Error ? syncErr.message : "rubitime_update_failed";
      if (isExternalSlotConflict(syncCode)) {
        return NextResponse.json(
          { ok: false, error: "external_slot_taken", hint: "refresh_calendar" },
          { status: 409 },
        );
      }
      return NextResponse.json({ ok: false, error: "rubitime_sync_failed" }, { status: 502 });
    }
  }
  let result:
    | Awaited<ReturnType<typeof deps.bookingAppointmentLifecycle.staffReschedule>>
    | null = null;
  try {
    result = await deps.bookingAppointmentLifecycle.staffReschedule({
      appointmentId,
      organizationId: gate.ctx.organizationId,
      actorType,
      actorId: gate.ctx.session.user.userId,
      newStartAt: parsed.data.newStartAt,
      newEndAt: parsed.data.newEndAt,
      durationMinutes: parsed.data.durationMinutes,
      reason: parsed.data.reason,
      staffComment: parsed.data.staffComment,
      branchId: parsed.data.branchId,
      specialistId: parsed.data.specialistId,
      serviceId: parsed.data.serviceId,
      manualOverride: true,
    });
  } catch (err) {
    await rollbackExternalReschedule();
    if (isSlotOverlapError(err)) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    if (err instanceof Error && err.message === "appointment_not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "reschedule_failed" }, { status: 500 });
  }
  if (!result.ok) {
    await rollbackExternalReschedule();
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  const { loadBookingLifecycleNotificationsFromSystemSettings } = await import(
    "@/modules/booking-notifications/settings"
  );
  const lifecycleNotificationSettings = await loadBookingLifecycleNotificationsFromSystemSettings(
    (key, scope) => deps.systemSettings.getSetting(key, scope),
  );
  await applyStaffRescheduleSideEffects({
    projection: deps.appointmentProjection,
    lifecycle: deps.bookingAppointmentLifecycle,
    organizationId: gate.ctx.organizationId,
    appointment: result.appointment,
    reschedulePolicy: result.reschedulePolicy,
    syncPort,
    bookingRow,
    lifecycleNotificationSettings,
  });
  if (deps.payments) {
    await deps.payments.recordReschedulePaymentCarryOver({
      appointmentId,
      organizationId: gate.ctx.organizationId,
      platformUserId: result.appointment.platformUserId,
      newStartAt: parsed.data.newStartAt,
    });
  }
  return NextResponse.json({ ok: true, appointment: result.appointment });
}
