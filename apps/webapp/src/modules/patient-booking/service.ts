import type {
  PatientBookingService,
  PatientBookingsPort,
  BookingSyncPort,
  BookingSlotsQuery,
  CreatePendingPatientBookingInput,
} from "./ports";
import type { CreatePatientBookingInput } from "./types";
import type { BookingCatalogService } from "@/modules/booking-catalog/service";
import type { createBookingEngineService } from "@/modules/booking-engine/service";
import type { createBookingSchedulingService } from "@/modules/booking-scheduling/service";
import type { createBookingFormService } from "@/modules/booking-form/service";
import type { createBookingAppointmentLifecycleService } from "@/modules/booking-appointment-lifecycle/service";
import type { PaymentsService } from "@/modules/payments/service";

type BookingEngineService = ReturnType<typeof createBookingEngineService>;
type BookingSchedulingService = ReturnType<typeof createBookingSchedulingService>;
type BookingFormService = ReturnType<typeof createBookingFormService>;
type BookingAppointmentLifecycleService = ReturnType<typeof createBookingAppointmentLifecycleService>;
import type { AppointmentProjectionPort } from "./ports";
import { validateCreatePatientBookingInput } from "./createInputValidation";
import { extractRubitimeManageUrlFromIntegratorCreateRaw } from "./rubitimeManageUrl";
import { createBookingOnCanonicalEngine, type CanonicalBookingDeps } from "./canonicalCreate";
import { buildBookingNotificationsSent } from "./bookingLifecycleNotifications";
import {
  projectCanonicalAppointmentCancelled,
  projectCanonicalAppointmentRescheduled,
} from "./projectCanonicalAppointment";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";
import type { PatientBookingRecord } from "./types";
import { prepaymentContextFromBooking } from "@/modules/payments/prepaymentContextFromBooking";

function isPostgresExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

async function loadBookingPaymentStatus(
  row: PatientBookingRecord | null,
  input: {
    bookingEngine: BookingEngineService | null | undefined;
    payments: PaymentsService | null | undefined;
  },
) {
  if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.payments) {
    return { ok: false as const, error: "not_found" as const };
  }
  const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
  const summary = await input.payments.getAppointmentPaymentSummary(
    row.canonicalAppointmentId,
    orgId,
    undefined,
    prepaymentContextFromBooking(row),
  );
  return {
    ok: true as const,
    booking: row,
    summary,
    intentId: summary?.intent?.id ?? null,
  };
}

function rowToProjectionInput(row: PatientBookingRecord) {
  return {
    phoneNormalized: normalizeRuPhoneE164(row.contactPhone) ?? (row.contactPhone.trim() || null),
    contactName: row.contactName,
    serviceTitle: row.serviceTitleSnapshot,
    branchTitle: row.branchTitleSnapshot,
  };
}

function cacheKey(query: BookingSlotsQuery): string {
  if (query.type === "online") {
    return JSON.stringify({
      type: query.type,
      category: query.category,
      date: query.date ?? "",
      slotCount: query.slotCount ?? 1,
    });
  }
  return JSON.stringify({
    type: query.type,
    branchServiceId: query.branchServiceId,
    date: query.date ?? "",
    slotCount: query.slotCount ?? 1,
  });
}

function toPendingRowOnline(input: CreatePatientBookingInput & { type: "online" }): CreatePendingPatientBookingInput {
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
    durationMinutesSnapshot: null,
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
  const { branch, service, branchService, specialist, city } = resolved;
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

export function createPatientBookingService(input: {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  bookingCatalog: BookingCatalogService | null;
  bookingEngine?: BookingEngineService | null;
  bookingScheduling?: BookingSchedulingService | null;
  bookingForm?: BookingFormService | null;
  appointmentProjection?: AppointmentProjectionPort | null;
  appointmentLifecycle?: BookingAppointmentLifecycleService | null;
  payments?: PaymentsService | null;
  isRubitimeBridgeEnabled?: () => Promise<boolean>;
  slotsTtlMs?: number;
}): PatientBookingService {
  const slotsTtlMs = input.slotsTtlMs ?? 60 * 1000;
  const slotsCache = new Map<
    string,
    { fetchedAt: number; expiresAt: number; value: Awaited<ReturnType<BookingSyncPort["fetchSlots"]>> }
  >();
  let lastSlotsMutationAt = 0;
  const inFlightCreateBySlot = new Set<string>();

  function invalidateSlotsCache(): void {
    lastSlotsMutationAt = Date.now();
    slotsCache.clear();
  }

  const canonicalDeps: CanonicalBookingDeps | null =
    input.bookingEngine && input.bookingScheduling
      ? {
          bookingsPort: input.bookingsPort,
          syncPort: input.syncPort,
          bookingCatalog: input.bookingCatalog,
          bookingEngine: input.bookingEngine,
          bookingScheduling: input.bookingScheduling,
          bookingForm: input.bookingForm ?? null,
          appointmentProjection: input.appointmentProjection ?? null,
          payments: input.payments ?? null,
          isRubitimeBridgeEnabled: input.isRubitimeBridgeEnabled ?? (async () => false),
        }
      : null;

  return {
    async getSlots(query) {
      const key = cacheKey(query);
      const now = Date.now();
      const cached = slotsCache.get(key);
      if (cached && cached.expiresAt > now && cached.fetchedAt >= lastSlotsMutationAt) {
        return cached.value;
      }

      let value: Awaited<ReturnType<BookingSyncPort["fetchSlots"]>>;
      if (input.bookingScheduling && input.bookingEngine) {
        if (query.type === "online") {
          const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
          value = await input.bookingScheduling.getOnlineSlots({
            organizationId: orgId,
            category: query.category,
            date: query.date,
            slotCount: query.slotCount,
          });
        } else {
          value = await input.bookingScheduling.getInPersonSlots({
            branchServiceId: query.branchServiceId,
            date: query.date,
            slotCount: query.slotCount,
          });
        }
      } else if (query.type === "online") {
        value = await input.syncPort.fetchSlots({
          type: "online",
          category: query.category,
          date: query.date,
        });
      } else {
        if (!input.bookingCatalog) {
          throw new Error("catalog_unavailable");
        }
        const resolved = await input.bookingCatalog.resolveBranchService(query.branchServiceId);
        value = await input.syncPort.fetchSlots({
          version: "v2",
          rubitimeBranchId: resolved.branch.rubitimeBranchId,
          rubitimeCooperatorId: resolved.specialist.rubitimeCooperatorId,
          rubitimeServiceId: resolved.branchService.rubitimeServiceId,
          slotDurationMinutes: resolved.service.durationMinutes,
          branchTimezone: resolved.branch.timezone,
          date: query.date,
        });
      }

      slotsCache.set(key, { fetchedAt: now, value, expiresAt: now + slotsTtlMs });
      return value;
    },

    async createBooking(rawInput) {
      const createInput = validateCreatePatientBookingInput(rawInput);
      const formAnswers = rawInput.formAnswers ?? [];

      if (canonicalDeps) {
        return createBookingOnCanonicalEngine(canonicalDeps, createInput, formAnswers);
      }

      const slotLockKey =
        createInput.type === "in_person"
          ? `${createInput.branchServiceId}|${createInput.slotStart}|${createInput.slotEnd}`
          : `online:${createInput.category}|${createInput.slotStart}|${createInput.slotEnd}`;
      if (inFlightCreateBySlot.has(slotLockKey)) {
        throw new Error("slot_overlap");
      }
      inFlightCreateBySlot.add(slotLockKey);

      try {
        let pendingRow: CreatePendingPatientBookingInput;
        let resolved: Awaited<ReturnType<BookingCatalogService["resolveBranchService"]>> | undefined;

        if (createInput.type === "online") {
          pendingRow = toPendingRowOnline(createInput);
        } else {
          if (!input.bookingCatalog) {
            throw new Error("catalog_unavailable");
          }
          resolved = await input.bookingCatalog.resolveBranchService(createInput.branchServiceId);
          const expectedCity = resolved.city.code.trim().toLowerCase();
          const clientCity = createInput.cityCode.trim().toLowerCase();
          if (clientCity !== expectedCity) {
            throw new Error("city_mismatch");
          }
          pendingRow = toPendingRowInPerson(createInput, resolved);
        }

        const pending = await input.bookingsPort.createPending(pendingRow);

        let sync: { rubitimeId: string | null; raw: Record<string, unknown> };
        try {
          if (createInput.type === "online") {
            sync = await input.syncPort.createRecord({
              type: "online",
              category: createInput.category,
              slotStart: createInput.slotStart,
              slotEnd: createInput.slotEnd,
              contactName: createInput.contactName,
              contactPhone: createInput.contactPhone,
              contactEmail: createInput.contactEmail,
            });
          } else {
            if (!resolved) throw new Error("catalog_unavailable");
            sync = await input.syncPort.createRecord({
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
          }
        } catch (err) {
          await input.bookingsPort.markFailedSync(pending.id);
          invalidateSlotsCache();
          const code = err instanceof Error ? err.message : "rubitime_create_failed";
          throw new Error(code);
        }
        const rubitimeIdTrimmed = sync.rubitimeId?.trim() ?? "";
        if (!rubitimeIdTrimmed) {
          await input.bookingsPort.markFailedSync(pending.id);
          invalidateSlotsCache();
          throw new Error("rubitime_id_missing");
        }
        let confirmed: Awaited<ReturnType<PatientBookingsPort["markConfirmed"]>>;
        try {
          const rubitimeManageUrl = extractRubitimeManageUrlFromIntegratorCreateRaw(sync.raw);
          confirmed = await input.bookingsPort.markConfirmed(pending.id, rubitimeIdTrimmed, {
            rubitimeManageUrl,
          });
        } catch (err) {
          const slotOverlap =
            (err instanceof Error && err.message === "slot_overlap") || isPostgresExclusionViolation(err);
          if (slotOverlap) {
            try {
              await input.syncPort.cancelRecord(rubitimeIdTrimmed);
            } catch (cancelErr) {
              console.error("[patient-booking] failed to rollback rubitime record after slot overlap", {
                bookingId: pending.id,
                rubitimeId: rubitimeIdTrimmed,
                cancelErr,
              });
            }
            await input.bookingsPort.markCancelled({
              bookingId: pending.id,
              reason: "slot_overlap",
              status: "cancelled",
            });
            invalidateSlotsCache();
            throw new Error("slot_overlap");
          }
          console.error("[patient-booking] booking confirm failed after rubitime create", {
            bookingId: pending.id,
            rubitimeId: rubitimeIdTrimmed,
            err,
          });
          invalidateSlotsCache();
          throw new Error("booking_confirm_failed");
        }
        invalidateSlotsCache();
        const finalized = confirmed ?? pending;
        try {
          await input.syncPort.emitBookingEvent({
            eventType: "booking.created",
            idempotencyKey: `booking.created:${pending.id}`,
            payload: {
              bookingId: finalized.id,
              userId: finalized.userId as string,
              rubitimeId: finalized.rubitimeId,
              bookingType: finalized.bookingType,
              city: finalized.city ?? undefined,
              category: finalized.category,
              slotStart: finalized.slotStart,
              slotEnd: finalized.slotEnd,
              contactName: finalized.contactName,
              contactPhone: finalized.contactPhone,
              contactEmail: finalized.contactEmail ?? undefined,
              branchServiceId: finalized.branchServiceId,
              cityCodeSnapshot: finalized.cityCodeSnapshot,
              serviceTitleSnapshot: finalized.serviceTitleSnapshot,
            },
          });
        } catch {
          // Integration notifications/reminders are best-effort and must not fail booking confirmation.
        }
        if (confirmed) return confirmed;
        return pending;
      } finally {
        inFlightCreateBySlot.delete(slotLockKey);
      }
    },

    async getBookingPaymentStatus(bookingId: string, userId: string) {
      const row = await input.bookingsPort.getByIdForUser(bookingId, userId);
      return loadBookingPaymentStatus(row, {
        bookingEngine: input.bookingEngine ?? null,
        payments: input.payments ?? null,
      });
    },

    async getBookingPaymentStatusForContact(bookingId: string, contactPhone: string) {
      const row = await input.bookingsPort.getById(bookingId);
      if (!row) return { ok: false as const, error: "not_found" as const };
      const normalized = normalizeRuPhoneE164(contactPhone) ?? contactPhone.trim();
      const rowPhone = normalizeRuPhoneE164(row.contactPhone) ?? row.contactPhone.trim();
      if (normalized !== rowPhone) return { ok: false as const, error: "forbidden" as const };
      return loadBookingPaymentStatus(row, {
        bookingEngine: input.bookingEngine ?? null,
        payments: input.payments ?? null,
      });
    },

    async listPaymentHistory(userId: string) {
      if (!input.bookingEngine || !input.payments) return [];
      const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
      return input.payments.listPaymentHistoryForUser(userId, orgId);
    },

    async getBookingByCanonicalAppointment(canonicalAppointmentId: string) {
      return input.bookingsPort.getByCanonicalAppointmentId(canonicalAppointmentId);
    },

    async previewCancel(previewInput) {
      const row = await input.bookingsPort.getByIdForUser(previewInput.bookingId, previewInput.userId);
      if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.appointmentLifecycle) {
        return { ok: false, error: "no_canonical" };
      }
      const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
      const preview = await input.appointmentLifecycle.previewPatientCancel(row.canonicalAppointmentId, orgId);
      if (!preview.ok) return { ok: false, error: "not_found" };
      return {
        ok: true,
        allowed: preview.allowed,
        isFree: preview.isFree,
        messageKey: preview.messageKey,
      };
    },

    async previewReschedule(previewInput) {
      const row = await input.bookingsPort.getByIdForUser(previewInput.bookingId, previewInput.userId);
      if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.appointmentLifecycle) {
        return { ok: false, error: "no_canonical" };
      }
      const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
      const preview = await input.appointmentLifecycle.previewPatientReschedule(
        row.canonicalAppointmentId,
        orgId,
      );
      if (!preview.ok) return { ok: false, error: "not_found" };
      return {
        ok: true,
        allowed: preview.allowed,
        messageKey: preview.messageKey,
        remainingSelfReschedules: preview.remainingSelfReschedules,
      };
    },

    async rescheduleBooking(rescheduleInput) {
      const row = await input.bookingsPort.getByIdForUser(rescheduleInput.bookingId, rescheduleInput.userId);
      if (!row?.canonicalAppointmentId || !input.bookingEngine || !input.bookingScheduling || !input.appointmentLifecycle) {
        return { ok: false, error: "no_canonical" };
      }
      if (row.status === "cancelled" || row.status === "cancelling") {
        return { ok: false, error: "not_found" };
      }

      const durationMinutes = Math.max(
        1,
        Math.round(
          (new Date(rescheduleInput.slotEnd).getTime() - new Date(rescheduleInput.slotStart).getTime()) / 60_000,
        ),
      );

      try {
        if (row.bookingType === "in_person" && row.branchServiceId) {
          await input.bookingScheduling.assertSlotAvailable({
            branchServiceId: row.branchServiceId,
            slotStart: rescheduleInput.slotStart,
            slotEnd: rescheduleInput.slotEnd,
            durationMinutes,
            excludeAppointmentId: row.canonicalAppointmentId,
          });
        } else {
          const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
          await input.bookingScheduling.assertSlotAvailable({
            organizationId: orgId,
            specialistId: null,
            roomId: null,
            slotStart: rescheduleInput.slotStart,
            slotEnd: rescheduleInput.slotEnd,
            durationMinutes,
            excludeAppointmentId: row.canonicalAppointmentId,
          });
        }
      } catch (err) {
        if (isPostgresExclusionViolation(err) || (err instanceof Error && err.message === "slot_overlap")) {
          return { ok: false, error: "slot_overlap" };
        }
        throw err;
      }

      const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
      const result = await input.appointmentLifecycle.patientReschedule({
        appointmentId: row.canonicalAppointmentId,
        organizationId: orgId,
        userId: rescheduleInput.userId,
        newStartAt: rescheduleInput.slotStart,
        newEndAt: rescheduleInput.slotEnd,
        durationMinutes,
        reason: rescheduleInput.reason,
      });
      if (!result.ok) {
        const err = result.error;
        if (
          err === "not_found" ||
          err === "too_late" ||
          err === "limit_exceeded" ||
          err === "change_not_allowed" ||
          err === "staff_confirmation_required"
        ) {
          return { ok: false, error: err };
        }
        return { ok: false, error: "not_found" };
      }

      if (row.rubitimeId && input.syncPort.updateRecord) {
        try {
          await input.syncPort.updateRecord({
            rubitimeId: row.rubitimeId,
            slotStart: rescheduleInput.slotStart,
            slotEnd: rescheduleInput.slotEnd,
          });
        } catch {
          // Canonical reschedule is primary; Rubitime mirror is best-effort.
        }
      }

      const updatedRow = await input.bookingsPort.updateSlotsAfterReschedule({
        bookingId: row.id,
        slotStart: rescheduleInput.slotStart,
        slotEnd: rescheduleInput.slotEnd,
        status: row.status === "awaiting_payment" ? "awaiting_payment" : "confirmed",
      });
      invalidateSlotsCache();

      if (input.payments && row.canonicalAppointmentId) {
        await input.payments.recordReschedulePaymentCarryOver({
          appointmentId: row.canonicalAppointmentId,
          organizationId: orgId,
          platformUserId: rescheduleInput.userId,
          newStartAt: rescheduleInput.slotStart,
        });
      }

      if (input.appointmentProjection) {
        await projectCanonicalAppointmentRescheduled(
          input.appointmentProjection,
          result.appointment,
          rowToProjectionInput(row),
        );
      }

      const idempotencyKey = `booking.rescheduled:${row.id}:${rescheduleInput.slotStart}`;
      let integratorStatus: "sent" | "failed" = "failed";
      try {
        await input.syncPort.emitBookingEvent({
          eventType: "booking.rescheduled",
          idempotencyKey,
          payload: {
            bookingId: row.id,
            userId: row.userId as string,
            rubitimeId: row.rubitimeId,
            bookingType: row.bookingType,
            city: row.city ?? undefined,
            category: row.category,
            slotStart: rescheduleInput.slotStart,
            slotEnd: rescheduleInput.slotEnd,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            contactEmail: row.contactEmail ?? undefined,
            branchServiceId: row.branchServiceId,
            cityCodeSnapshot: row.cityCodeSnapshot,
            serviceTitleSnapshot: row.serviceTitleSnapshot,
          },
        });
        integratorStatus = "sent";
      } catch {
        // Best-effort notifications.
      }

      await input.appointmentLifecycle.patchLatestRescheduleNotifications(
        row.canonicalAppointmentId,
        orgId,
        buildBookingNotificationsSent({
          eventType: "booking.rescheduled",
          idempotencyKey,
          notifyPatient: result.reschedulePolicy.notifyPatient,
          notifyStaff: result.reschedulePolicy.notifyStaff,
          integratorStatus,
        }),
      );

      return { ok: true, booking: updatedRow ?? row };
    },

    async cancelBooking(cancelInput) {
      const row = await input.bookingsPort.getByIdForUser(cancelInput.bookingId, cancelInput.userId);
      if (!row) return { ok: false, error: "not_found" };
      if (row.status === "cancelled" || row.status === "cancelling") {
        return { ok: false, error: "already_cancelled" };
      }

      if (row.canonicalAppointmentId && input.bookingEngine && input.appointmentLifecycle) {
        const orgId = await input.bookingEngine.organization.getDefaultOrganizationId();
        const preview = await input.appointmentLifecycle.previewPatientCancel(row.canonicalAppointmentId, orgId);
        if (!preview.ok) return { ok: false, error: "not_found" };
        if (!preview.allowed) return { ok: false, error: "not_allowed" };
        if (preview.requiresStaffConfirmation) {
          return { ok: false, error: "staff_confirmation_required" };
        }

        await input.bookingsPort.markCancelling(row.id);
        if (row.rubitimeId) {
          try {
            await input.syncPort.cancelRecord(row.rubitimeId);
          } catch {
            await input.bookingsPort.markCancelled({
              bookingId: row.id,
              reason: "cancel_sync_failed",
              status: "cancel_failed",
            });
            invalidateSlotsCache();
            return { ok: false, error: "sync_failed" };
          }
        }

        const lifecycleResult = await input.appointmentLifecycle.patientCancel({
          appointmentId: row.canonicalAppointmentId,
          organizationId: orgId,
          userId: cancelInput.userId,
          reason: cancelInput.reason,
        });
        if (!lifecycleResult.ok) {
          await input.bookingsPort.markCancelled({
            bookingId: row.id,
            reason: "cancel_lifecycle_failed",
            status: "cancel_failed",
          });
          invalidateSlotsCache();
          if (lifecycleResult.error === "not_allowed") return { ok: false, error: "not_allowed" };
          if (lifecycleResult.error === "staff_confirmation_required") {
            return { ok: false, error: "staff_confirmation_required" };
          }
          return { ok: false, error: "lifecycle_failed" };
        }

        if (input.payments) {
          await input.payments.applyCancelPaymentOutcome({
            appointmentId: row.canonicalAppointmentId,
            organizationId: orgId,
            prepaymentRetained: lifecycleResult.eligibility
              ? !lifecycleResult.eligibility.isFree &&
                lifecycleResult.cancelPolicy.lateCancellationBehavior === "retain_prepayment"
              : false,
            prepaymentRefunded: lifecycleResult.eligibility
              ? !lifecycleResult.eligibility.isFree &&
                lifecycleResult.cancelPolicy.lateCancellationBehavior === "refund_prepayment"
              : false,
            reason: cancelInput.reason,
          });
        }

        await input.bookingsPort.markCancelled({
          bookingId: row.id,
          reason: cancelInput.reason,
          status: "cancelled",
        });
        invalidateSlotsCache();

        if (input.appointmentProjection) {
          await projectCanonicalAppointmentCancelled(
            input.appointmentProjection,
            lifecycleResult.appointment,
            rowToProjectionInput(row),
          );
        }

        const idempotencyKey = `booking.cancelled:${row.id}`;
        let integratorStatus: "sent" | "failed" = "failed";
        try {
          await input.syncPort.emitBookingEvent({
            eventType: "booking.cancelled",
            idempotencyKey,
            payload: {
              bookingId: row.id,
              userId: row.userId as string,
              rubitimeId: row.rubitimeId,
              bookingType: row.bookingType,
              city: row.city ?? undefined,
              category: row.category,
              slotStart: row.slotStart,
              slotEnd: row.slotEnd,
              contactName: row.contactName,
              contactPhone: row.contactPhone,
              contactEmail: row.contactEmail ?? undefined,
              reason: cancelInput.reason,
              branchServiceId: row.branchServiceId,
              cityCodeSnapshot: row.cityCodeSnapshot,
              serviceTitleSnapshot: row.serviceTitleSnapshot,
            },
          });
          integratorStatus = "sent";
        } catch {
          // Best-effort.
        }

        await input.appointmentLifecycle.patchLatestCancellationNotifications(
          row.canonicalAppointmentId,
          orgId,
          buildBookingNotificationsSent({
            eventType: "booking.cancelled",
            idempotencyKey,
            notifyPatient: lifecycleResult.cancelPolicy.notifyPatient,
            notifyStaff: lifecycleResult.cancelPolicy.notifyStaff,
            integratorStatus,
          }),
        );

        return {
          ok: true,
          lateCancellation:
            lifecycleResult.eligibility.reasonCode === "late" ||
            lifecycleResult.eligibility.reasonCode === "forfeited_by_reschedule",
        };
      }

      await input.bookingsPort.markCancelling(row.id);
      if (row.rubitimeId) {
        try {
          await input.syncPort.cancelRecord(row.rubitimeId);
        } catch {
          await input.bookingsPort.markCancelled({
            bookingId: row.id,
            reason: "cancel_sync_failed",
            status: "cancel_failed",
          });
          invalidateSlotsCache();
          return { ok: false, error: "sync_failed" };
        }
      }
      await input.bookingsPort.markCancelled({
        bookingId: row.id,
        reason: cancelInput.reason,
        status: "cancelled",
      });
      invalidateSlotsCache();
      try {
        await input.syncPort.emitBookingEvent({
          eventType: "booking.cancelled",
          idempotencyKey: `booking.cancelled:${row.id}`,
          payload: {
            bookingId: row.id,
            userId: row.userId as string,
            rubitimeId: row.rubitimeId,
            bookingType: row.bookingType,
            city: row.city ?? undefined,
            category: row.category,
            slotStart: row.slotStart,
            slotEnd: row.slotEnd,
            contactName: row.contactName,
            contactPhone: row.contactPhone,
            contactEmail: row.contactEmail ?? undefined,
            reason: cancelInput.reason,
            branchServiceId: row.branchServiceId,
            cityCodeSnapshot: row.cityCodeSnapshot,
            serviceTitleSnapshot: row.serviceTitleSnapshot,
          },
        });
      } catch {
        // Booking cancellation state is primary; event fan-out is best-effort.
      }
      return { ok: true };
    },

    async listMyBookings(userId) {
      const nowIso = new Date().toISOString();
      const [upcoming, history] = await Promise.all([
        input.bookingsPort.listUpcomingByUser(userId, nowIso),
        input.bookingsPort.listHistoryByUser(userId, nowIso),
      ]);
      return { upcoming, history };
    },

    async applyRubitimeUpdate(update) {
      await input.bookingsPort.upsertFromRubitime(update);
      invalidateSlotsCache();
    },
  };
}
