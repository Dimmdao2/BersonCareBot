import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
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
import { requireAdminBookingEngine } from "../../_requireAdminBookingEngine";

const bodySchema = z.object({
  organizationId: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable().optional(),
  roomId: z.string().uuid().nullable().optional(),
  specialistId: z.string().uuid().nullable().optional(),
  serviceId: z.string().uuid().nullable().optional(),
  platformUserId: z.string().uuid().nullable().optional(),
  phoneNormalized: z.string().nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  durationMinutes: z.number().int().positive(),
  title: z.string().optional(),
});

async function resolveDefaultSpecialistId(
  deps: ReturnType<typeof buildAppDeps>,
  organizationId: string,
): Promise<string | null> {
  if (!deps.bookingEngine) return null;
  const specialists = await deps.bookingEngine.catalog.listSpecialists(organizationId);
  const active = specialists.find((item) => item.isActive) ?? specialists[0] ?? null;
  return active?.id ?? null;
}

async function resolveRubitimeSyncContext(input: {
  deps: ReturnType<typeof buildAppDeps>;
  organizationId: string;
  branchId: string | null;
  serviceId: string | null;
  specialistId: string | null;
}): Promise<StaffRubitimeSyncContext | null> {
  if (!input.branchId || !input.serviceId) return null;
  if (!input.deps.bookingScheduling || !input.deps.bookingCatalog) {
    throw new Error("rubitime_sync_unavailable");
  }
  const specialistId = input.specialistId ?? (await resolveDefaultSpecialistId(input.deps, input.organizationId));
  if (!specialistId) throw new Error("rubitime_sync_context_missing");
  const branchServiceId = await input.deps.bookingScheduling.resolveLegacyBranchServiceId({
    organizationId: input.organizationId,
    branchId: input.branchId,
    serviceId: input.serviceId,
    specialistId,
  });
  if (!branchServiceId) throw new Error("rubitime_mapping_missing");
  const resolved = await input.deps.bookingCatalog.resolveBranchService(branchServiceId);
  return {
    rubitimeBranchId: resolved.branch.rubitimeBranchId,
    rubitimeCooperatorId: resolved.specialist.rubitimeCooperatorId,
    rubitimeServiceId: resolved.branchService.rubitimeServiceId,
  };
}

export async function POST(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const { ctx } = gate;
  const orgId = parsed.data.organizationId ?? ctx.organizationId;
  const deps = buildAppDeps();
  const syncPort = createBookingSyncPort();
  const bridgeEnabled = await isStaffRubitimeOutboundEnabled(deps);
  let syncContext: StaffRubitimeSyncContext | null = null;
  try {
    syncContext = await resolveRubitimeSyncContext({
      deps,
      organizationId: orgId,
      branchId: parsed.data.branchId ?? null,
      serviceId: parsed.data.serviceId ?? null,
      specialistId: parsed.data.specialistId ?? null,
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
        organizationId: orgId,
        specialistId: parsed.data.specialistId ?? null,
        roomId: parsed.data.roomId ?? null,
        slotStart: parsed.data.startAt,
        slotEnd: parsed.data.endAt,
        durationMinutes: parsed.data.durationMinutes,
      });
    }
    const appointment = await ctx.service.createAppointment({
      organizationId: orgId,
      branchId: parsed.data.branchId ?? null,
      roomId: parsed.data.roomId ?? null,
      specialistId: parsed.data.specialistId ?? null,
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
          organizationId: orgId,
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
        organizationId: orgId,
        appointmentId: appointment.id,
        rubitimeId: syncedRubitimeId,
      });
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
      // Lifecycle event is best-effort.
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
