import type {
  PatientBookingService,
  PatientBookingsPort,
  BookingSyncPort,
  BookingSlotsQuery,
  CreatePendingPatientBookingInput,
} from "./ports";
import type { CreatePatientBookingInput } from "./types";
import type { BookingCatalogService } from "@/modules/booking-catalog/service";
import { validateCreatePatientBookingInput } from "./createInputValidation";
import { extractRubitimeManageUrlFromIntegratorCreateRaw } from "./rubitimeManageUrl";

function isPostgresExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

function cacheKey(query: BookingSlotsQuery): string {
  if (query.type === "online") {
    return JSON.stringify({ type: query.type, category: query.category, date: query.date ?? "" });
  }
  return JSON.stringify({ type: query.type, branchServiceId: query.branchServiceId, date: query.date ?? "" });
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

  return {
    async getSlots(query) {
      const key = cacheKey(query);
      const now = Date.now();
      const cached = slotsCache.get(key);
      if (cached && cached.expiresAt > now && cached.fetchedAt >= lastSlotsMutationAt) {
        return cached.value;
      }

      let value: Awaited<ReturnType<BookingSyncPort["fetchSlots"]>>;
      if (query.type === "online") {
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
          date: query.date,
        });
      }

      slotsCache.set(key, { fetchedAt: now, value, expiresAt: now + slotsTtlMs });
      return value;
    },

    async createBooking(rawInput) {
      const createInput = validateCreatePatientBookingInput(rawInput);
      const slotLockKey = `${createInput.slotStart}|${createInput.slotEnd}`;
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

    async cancelBooking(cancelInput) {
      const row = await input.bookingsPort.getByIdForUser(cancelInput.bookingId, cancelInput.userId);
      if (!row) return { ok: false, error: "not_found" };
      if (row.status === "cancelled" || row.status === "cancelling") {
        return { ok: false, error: "already_cancelled" };
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
