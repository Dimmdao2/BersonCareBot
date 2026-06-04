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

const RUBITIME_CONFLICT_ERRORS = new Set([
  "slot_already_taken",
  "duplicate_local_booking_id",
  "rubitime_slot_conflict",
  "external_slot_taken",
]);

function isExternalSlotConflict(error: string): boolean {
  return RUBITIME_CONFLICT_ERRORS.has(error);
}

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
}): Promise<
  | {
      rubitimeBranchId: string;
      rubitimeCooperatorId: string;
      rubitimeServiceId: string;
    }
  | null
> {
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

async function rollbackCreatedAppointment(input: {
  ctx: DoctorBookingEngineContext;
  appointmentId: string;
  reason: string;
}): Promise<void> {
  if (input.ctx.service.deleteAppointmentHard) {
    try {
      const deleted = await input.ctx.service.deleteAppointmentHard({
        organizationId: input.ctx.organizationId,
        appointmentId: input.appointmentId,
      });
      if (deleted) return;
    } catch {
      // Fall through to status transition fallback.
    }
  }
  try {
    await input.ctx.service.transitionAppointmentStatus({
      appointmentId: input.appointmentId,
      toStatus: "cancelled_by_specialist",
      actorId: input.ctx.session.user.userId,
      payload: { reason: input.reason },
    });
  } catch {
    // Keep handler deterministic even if rollback transition fails.
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
  try {
    if (deps.bookingScheduling) {
      await deps.bookingScheduling.assertSlotAvailable({
        organizationId: ctx.organizationId,
        specialistId: parsed.data.specialistId ?? null,
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
    const syncPort = createBookingSyncPort();
    const syncContext = await resolveRubitimeSyncContext({
      deps,
      ctx,
      branchId: parsed.data.branchId ?? null,
      serviceId: parsed.data.serviceId ?? null,
      specialistId: parsed.data.specialistId ?? null,
    });
    let syncedRubitimeId: string | null = null;
    if (syncContext) {
      let createdRubitimeId: string | null = null;
      try {
        const syncResult = await syncPort.createRecord({
          version: "v2",
          rubitimeBranchId: syncContext.rubitimeBranchId,
          rubitimeCooperatorId: syncContext.rubitimeCooperatorId,
          rubitimeServiceId: syncContext.rubitimeServiceId,
          slotStart: appointment.startAt,
          contactName: staffBookingContactNameFromAppointment(appointment),
          contactPhone: appointment.phoneNormalized ?? "+70000000000",
          localBookingId: appointment.id,
        });
        createdRubitimeId = syncResult.rubitimeId?.trim() || null;
        if (!createdRubitimeId) throw new Error("rubitime_id_missing");
        await ctx.service.upsertRubitimeAppointmentMapping({
          organizationId: ctx.organizationId,
          appointmentId: appointment.id,
          rubitimeId: createdRubitimeId,
        });
        syncedRubitimeId = createdRubitimeId;
      } catch (syncErr) {
        const syncCode = syncErr instanceof Error ? syncErr.message : "rubitime_sync_failed";
        if (createdRubitimeId) {
          try {
            await syncPort.deleteRecord(createdRubitimeId);
          } catch {
            // Best-effort cleanup of external transient record.
          }
        }
        await rollbackCreatedAppointment({
          ctx,
          appointmentId: appointment.id,
          reason: isExternalSlotConflict(syncCode) ? "external_slot_taken_rollback" : "rubitime_sync_failed_rollback",
        });
        if (isExternalSlotConflict(syncCode)) {
          return NextResponse.json(
            { ok: false, error: "external_slot_taken", hint: "refresh_calendar" },
            { status: 409 },
          );
        }
        return NextResponse.json({ ok: false, error: "rubitime_sync_failed" }, { status: 502 });
      }
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
    return NextResponse.json({ ok: true, appointment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create_failed";
    if (message === "slot_overlap" || (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01")) {
      return NextResponse.json({ ok: false, error: "slot_overlap" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
