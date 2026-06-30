import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import {
  emitPackageLinkedCalendarSync,
} from "@/app-layer/booking/emitPackageCalendarSync";
import {
  staffBookingContactNameFromAppointment,
  staffBookingServiceTitleFromAppointment,
} from "@/app-layer/booking/staffBookingIntegratorEvent";
import { isStaffRubitimeOutboundEnabled } from "@/app-layer/booking/staffRubitimeBridgePolicy";
import {
  rollbackStaffManualAppointment,
  syncStaffManualAppointmentToRubitime,
  type StaffRubitimeSyncContext,
} from "@/app-layer/booking/staffRubitimeManualBooking";
import { createBookingSyncPort } from "@/modules/integrator/bookingM2mApi";
import {
  requireDoctorBookingEngine,
  type DoctorBookingEngineContext,
} from "../../_requireDoctorBookingEngine";

const bodySchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
});

async function resolveDefaultSpecialistId(ctx: DoctorBookingEngineContext): Promise<string | null> {
  const specialists = await ctx.service.catalog.listSpecialists(ctx.organizationId);
  const active = specialists.find((item) => item.isActive) ?? specialists[0] ?? null;
  return active?.id ?? null;
}

async function resolveRubitimeSyncContext(input: {
  deps: ReturnType<typeof buildAppDeps>;
  ctx: DoctorBookingEngineContext;
  branchId: string | null;
  serviceId: string | null;
  specialistId: string | null;
}): Promise<StaffRubitimeSyncContext | null> {
  if (!input.branchId || !input.serviceId) return null;
  if (!input.deps.bookingScheduling || !input.deps.bookingCatalog) {
    throw new Error("rubitime_sync_unavailable");
  }
  const specialistId = input.specialistId ?? (await resolveDefaultSpecialistId(input.ctx));
  if (!specialistId) throw new Error("rubitime_sync_context_missing");
  const branchServiceId = await input.deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId: input.ctx.organizationId,
    branchId: input.branchId,
    serviceId: input.serviceId,
    specialistId,
  });
  if (!branchServiceId) throw new Error("rubitime_mapping_missing");
  try {
    const resolved = await input.deps.bookingCatalog.resolveBranchService(branchServiceId);
    return {
      rubitimeBranchId: resolved.branch.rubitimeBranchId,
      rubitimeCooperatorId: resolved.specialist.rubitimeCooperatorId,
      rubitimeServiceId: resolved.branchService.rubitimeServiceId,
    };
  } catch {
    throw new Error("rubitime_mapping_missing");
  }
}

export async function POST(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { ctx } = gate;
  const deps = buildAppDeps();
  const syncPort = createBookingSyncPort();
  const bridgeEnabled = await isStaffRubitimeOutboundEnabled(deps);

  // Staff manual creates are in-person and MUST have a concrete specialist.
  // A NULL specialist_id bypasses the be_appointments_specialist_no_overlap
  // exclusion constraint (it only covers non-null), letting a booking land on
  // any occupied slot. ONLINE patient bookings legitimately use NULL, but they
  // never reach this route. (F2: null-specialist overlap escape.)
  const resolvedSpecialistId =
    parsed.data.specialistId ?? (await resolveDefaultSpecialistId(ctx));
  if (!resolvedSpecialistId) {
    return NextResponse.json({ ok: false, error: "specialist_required" }, { status: 400 });
  }

  let syncContext: StaffRubitimeSyncContext | null = null;
  try {
    syncContext = await resolveRubitimeSyncContext({
      deps,
      ctx,
      branchId: parsed.data.branchId ?? null,
      serviceId: parsed.data.serviceId ?? null,
      specialistId: resolvedSpecialistId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "rubitime_mapping_missing";
    if (message === "rubitime_mapping_missing" || message === "rubitime_sync_context_missing") {
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  try {
    if (deps.bookingScheduling) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: ctx.organizationId,
        specialistId: resolvedSpecialistId,
        roomId: parsed.data.roomId ?? null,
        slotStart: parsed.data.startAt,
        slotEnd: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
      });
    }
    let appointment = await ctx.service.createAppointment({
      organizationId: ctx.organizationId,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      specialistId: resolvedSpecialistId,
      serviceId: parsed.data.serviceId ?? null,
      platformUserId: parsed.data.platformUserId ?? null,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      durationMinutes: parsed.data.durationMinutes,
      source: "admin_manual",
      status: "confirmed",
      phoneNormalized: parsed.data.phoneNormalized ?? null,
      actorId: ctx.session.user.userId,
    });

    let syncedRubitimeId: string | null = null;
    let projectionWarning: string | undefined;
    if (syncContext && bridgeEnabled) {
      const syncResult = await syncStaffManualAppointmentToRubitime({
        syncPort,
        appointment,
        syncContext,
      });
      if (!syncResult.ok) {
        await rollbackStaffManualAppointment({
          deleteAppointmentHard: ctx.service.deleteAppointmentHard,
          transitionAppointmentStatus: ctx.service.transitionAppointmentStatus,
          organizationId: ctx.organizationId,
          appointmentId: appointment.id,
          actorId: ctx.session.user.userId,
          reason:
            syncResult.error === "external_slot_taken"
              ? "external_slot_taken_rollback"
              : "rubitime_sync_failed_rollback",
        });
        if (syncResult.error === "external_slot_taken") {
          return NextResponse.json(
            { ok: false, error: "external_slot_taken", hint: "refresh_calendar" },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: false, error: "rubitime_sync_failed" }, { status: 502 });
      }
      syncedRubitimeId = syncResult.rubitimeId;
      projectionWarning = syncResult.projectionWarning;
      await ctx.service.upsertRubitimeAppointmentMapping({
        organizationId: ctx.organizationId,
        appointmentId: appointment.id,
        rubitimeId: syncedRubitimeId,
      });
    }

    if (
      parsed.data.platformUserId &&
      parsed.data.serviceId &&
      deps.memberships
    ) {
      const picked = await deps.memberships.pickAutoPackageForBooking(
        parsed.data.platformUserId,
        ctx.organizationId,
        parsed.data.serviceId,
      );
      if (picked) {
        await deps.memberships.reserveForAppointment({
          organizationId: ctx.organizationId,
          patientPackageId: picked.id,
          serviceId: parsed.data.serviceId,
          appointmentId: appointment.id,
          platformUserId: parsed.data.platformUserId,
        });
        const fresh = await ctx.service.getAppointment(appointment.id);
        if (fresh) appointment = fresh;
        await emitPackageLinkedCalendarSync(syncPort, appointment);
      }
    }
    const bookingRow = deps.patientBooking
      ? await deps.patientBooking.getBookingByCanonicalAppointment(appointment.id)
      : null;
    try {
      await syncPort.emitBookingEvent({
        eventType: "booking.created",
        idempotencyKey: `staff.booking.created:${appointment.id}:${appointment.startAt}`,
        payload: {
          bookingId: bookingRow?.id ?? appointment.id,
          userId: bookingRow?.userId ?? appointment.platformUserId ?? appointment.id,
          rubitimeId: bookingRow?.rubitimeId ?? syncedRubitimeId ?? null,
          bookingType: bookingRow?.bookingType ?? "in_person",
          city: bookingRow?.city ?? undefined,
          category: bookingRow?.category ?? "general",
          slotStart: appointment.startAt,
          slotEnd: appointment.endAt,
          contactName: bookingRow?.contactName ?? staffBookingContactNameFromAppointment(appointment),
          contactPhone: bookingRow?.contactPhone ?? appointment.phoneNormalized ?? "+70000000000",
          contactEmail: bookingRow?.contactEmail ?? undefined,
          branchServiceId: bookingRow?.branchServiceId ?? null,
          cityCodeSnapshot: bookingRow?.cityCodeSnapshot ?? null,
          serviceTitleSnapshot: staffBookingServiceTitleFromAppointment(appointment, bookingRow),
          canonicalAppointmentId: appointment.id,
        },
      });
    } catch {
      // Lifecycle event is best-effort for staff manual create.
    }
    return NextResponse.json({
      ok: true,
      appointment,
      ...(projectionWarning ? { projectionWarning } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_failed";
    if (message === "slot_overlap" || (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01")) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
