import type { BookingCatalogService } from "@/modules/booking-catalog/service";
import type { createBookingEngineService } from "@/modules/booking-engine/service";

type BookingEngineService = ReturnType<typeof createBookingEngineService>;
import type { createBookingFormService } from "@/modules/booking-form/service";
import type { createBookingSchedulingService } from "@/modules/booking-scheduling/service";

type BookingFormService = ReturnType<typeof createBookingFormService>;
type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;
import type { AppointmentProjectionPort } from "./ports";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type {
  BookingSyncPort,
  PatientBookingsPort,
  CreatePendingPatientBookingInput,
} from "./ports";
import type { CreatePatientBookingInput, PatientBookingRecord } from "./types";
import { extractRubitimeManageUrlFromIntegratorCreateRaw } from "./rubitimeManageUrl";
import { projectCanonicalAppointmentForDoctor } from "./projectCanonicalAppointment";

function isPostgresExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

export type CanonicalBookingDeps = {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  bookingCatalog: BookingCatalogService | null;
  bookingEngine: BookingEngineService | null;
  bookingScheduling: BookingSchedulingService | null;
  bookingForm: BookingFormService | null;
  appointmentProjection: AppointmentProjectionPort | null;
  isRubitimeBridgeEnabled: () => Promise<boolean>;
};

function toPendingRowOnline(
  input: CreatePatientBookingInput & { type: "online" },
): CreatePendingPatientBookingInput {
  return {
    userId: input.userId,
    bookingType: "online",
    city: null,
    category: input.category,
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    branchId: null,
    serviceId: null,
    branchServiceId: null,
    cityCodeSnapshot: null,
    branchTitleSnapshot: null,
    serviceTitleSnapshot: null,
    durationMinutesSnapshot: 60,
    priceMinorSnapshot: null,
    rubitimeBranchIdSnapshot: null,
    rubitimeCooperatorIdSnapshot: null,
    rubitimeServiceIdSnapshot: null,
  };
}

function toPendingRowInPerson(
  input: CreatePatientBookingInput & { type: "in_person" },
  resolved: Awaited<ReturnType<BookingCatalogService["resolveBranchService"]>>,
): CreatePendingPatientBookingInput {
  const { branch, service, branchService, specialist, city } = resolved!;
  return {
    userId: input.userId,
    bookingType: "in_person",
    city: city.code,
    category: "general",
    slotStart: input.slotStart,
    slotEnd: input.slotEnd,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    contactEmail: input.contactEmail ?? null,
    branchId: branch.id,
    serviceId: service.id,
    branchServiceId: branchService.id,
    cityCodeSnapshot: city.code,
    branchTitleSnapshot: branch.title,
    serviceTitleSnapshot: service.title,
    durationMinutesSnapshot: service.durationMinutes,
    priceMinorSnapshot: service.priceMinor,
    rubitimeBranchIdSnapshot: branch.rubitimeBranchId,
    rubitimeCooperatorIdSnapshot: specialist.rubitimeCooperatorId,
    rubitimeServiceIdSnapshot: branchService.rubitimeServiceId,
  };
}

export async function createBookingOnCanonicalEngine(
  deps: CanonicalBookingDeps,
  createInput: CreatePatientBookingInput,
  formAnswers: { fieldKey: string; value: string }[] = [],
): Promise<PatientBookingRecord> {
  if (!deps.bookingEngine || !deps.bookingScheduling) {
    throw new Error("canonical_booking_unavailable");
  }

  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  const profilePrefill: Record<string, string> = {
    contact_name: createInput.contactName,
    contact_phone: createInput.contactPhone,
    first_name: createInput.contactName,
    phone: createInput.contactPhone,
    ...(createInput.contactEmail ? { contact_email: createInput.contactEmail, email: createInput.contactEmail } : {}),
  };

  if (deps.bookingForm) {
    const validation = await deps.bookingForm.validateAnswers(orgId, "patient", formAnswers, profilePrefill);
    if (!validation.ok) throw new Error(validation.error);
  }

  let pendingRow: CreatePendingPatientBookingInput;
  let durationMinutes = 60;
  let resolved: Awaited<ReturnType<BookingCatalogService["resolveBranchService"]>> | undefined;
  let canonicalBranchId: string | null = null;
  let canonicalSpecialistId: string | null = null;
  let canonicalServiceId: string | null = null;
  let canonicalRoomId: string | null = null;

  if (createInput.type === "online") {
    pendingRow = toPendingRowOnline(createInput);
    await deps.bookingScheduling.assertSlotAvailable({
      organizationId: orgId,
      specialistId: null,
      roomId: null,
      slotStart: createInput.slotStart,
      slotEnd: createInput.slotEnd,
      durationMinutes: 60,
    });
  } else {
    if (!deps.bookingCatalog) throw new Error("catalog_unavailable");
    resolved = await deps.bookingCatalog.resolveBranchService(createInput.branchServiceId);
    if (!resolved) throw new Error("branch_service_not_found");
    const expectedCity = resolved.city.code.trim().toLowerCase();
    if (createInput.cityCode.trim().toLowerCase() !== expectedCity) throw new Error("city_mismatch");
    pendingRow = toPendingRowInPerson(createInput, resolved);
    durationMinutes = resolved.service.durationMinutes;
    await deps.bookingScheduling.assertSlotAvailable({
      branchServiceId: createInput.branchServiceId,
      slotStart: createInput.slotStart,
      slotEnd: createInput.slotEnd,
      durationMinutes,
    });
    const ctx = await deps.bookingScheduling.resolveInPersonContext(createInput.branchServiceId);
    if (!ctx) throw new Error("branch_service_not_found");
    canonicalBranchId = ctx.branchId;
    canonicalSpecialistId = ctx.specialistId;
    canonicalServiceId = ctx.serviceId;
    canonicalRoomId = ctx.roomId;
  }

  const slotDurationMinutes = Math.max(
    1,
    Math.round((new Date(createInput.slotEnd).getTime() - new Date(createInput.slotStart).getTime()) / 60_000),
  );
  if (pendingRow.durationMinutesSnapshot != null) {
    pendingRow = { ...pendingRow, durationMinutesSnapshot: slotDurationMinutes };
  }

  const pending = await deps.bookingsPort.createPending(pendingRow);

  const phoneNormalized = normalizeRuPhoneE164(createInput.contactPhone) ?? createInput.contactPhone.trim();
  let appointment;
  try {
    appointment = await deps.bookingEngine.createAppointment({
      organizationId: orgId,
      branchId: canonicalBranchId,
      roomId: canonicalRoomId,
      specialistId: canonicalSpecialistId,
      serviceId: canonicalServiceId,
      platformUserId: createInput.userId,
      startAt: createInput.slotStart,
      endAt: createInput.slotEnd,
      durationMinutes: slotDurationMinutes,
      source: createInput.userId ? "native" : "public_widget",
      status: "confirmed",
      phoneNormalized,
      actorId: createInput.userId,
    });
  } catch (err) {
    await deps.bookingsPort.markFailedSync(pending.id);
    if (isPostgresExclusionViolation(err)) throw new Error("slot_overlap");
    throw err;
  }

  if (deps.bookingForm && formAnswers.length > 0) {
    await deps.bookingForm.saveForAppointment(orgId, appointment.id, formAnswers);
  }

  let rubitimeId: string | null = null;
  let rubitimeManageUrl: string | null = null;
  const bridgeEnabled = await deps.isRubitimeBridgeEnabled();

  if (bridgeEnabled) {
    try {
      let sync: { rubitimeId: string | null; raw: Record<string, unknown> };
      if (createInput.type === "online") {
        sync = await deps.syncPort.createRecord({
          type: "online",
          category: createInput.category,
          slotStart: createInput.slotStart,
          slotEnd: createInput.slotEnd,
          contactName: createInput.contactName,
          contactPhone: createInput.contactPhone,
          contactEmail: createInput.contactEmail,
        });
      } else if (resolved) {
        sync = await deps.syncPort.createRecord({
          version: "v2",
          rubitimeBranchId: resolved.branch.rubitimeBranchId,
          rubitimeCooperatorId: resolved.specialist.rubitimeCooperatorId,
          rubitimeServiceId: resolved.branchService.rubitimeServiceId,
          slotStart: createInput.slotStart,
          contactName: createInput.contactName,
          contactPhone: createInput.contactPhone,
          contactEmail: createInput.contactEmail,
          localBookingId: pending.id,
        });
      } else {
        sync = { rubitimeId: null, raw: {} };
      }
      rubitimeId = sync.rubitimeId?.trim() || null;
      rubitimeManageUrl = extractRubitimeManageUrlFromIntegratorCreateRaw(sync.raw);
      if (rubitimeId) {
        await deps.bookingEngine.upsertRubitimeAppointmentMapping({
          organizationId: orgId,
          appointmentId: appointment.id,
          rubitimeId,
        });
      }
    } catch {
      // Rubitime sync is best-effort; canonical appointment remains primary.
    }
  }

  const confirmed = await deps.bookingsPort.markConfirmed(pending.id, rubitimeId, {
    rubitimeManageUrl,
    canonicalAppointmentId: appointment.id,
  });

  if (deps.appointmentProjection) {
    try {
      await projectCanonicalAppointmentForDoctor(deps.appointmentProjection, appointment, {
        phoneNormalized,
        contactName: createInput.contactName,
        serviceTitle: pendingRow.serviceTitleSnapshot,
        branchTitle: pendingRow.branchTitleSnapshot,
      });
    } catch {
      // Doctor projection is best-effort on transition.
    }
  }

  try {
    await deps.syncPort.emitBookingEvent({
      eventType: "booking.created",
      idempotencyKey: `booking.created:${pending.id}`,
      payload: {
        bookingId: (confirmed ?? pending).id,
        userId: createInput.userId,
        rubitimeId,
        bookingType: pendingRow.bookingType,
        city: pendingRow.city ?? undefined,
        category: pendingRow.category,
        slotStart: pendingRow.slotStart,
        slotEnd: pendingRow.slotEnd,
        contactName: pendingRow.contactName,
        contactPhone: pendingRow.contactPhone,
        contactEmail: pendingRow.contactEmail ?? undefined,
        branchServiceId: pendingRow.branchServiceId,
        cityCodeSnapshot: pendingRow.cityCodeSnapshot,
        serviceTitleSnapshot: pendingRow.serviceTitleSnapshot,
      },
    });
  } catch {
    // Notifications are best-effort.
  }

  return confirmed ?? pending;
}
