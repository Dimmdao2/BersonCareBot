import type { PatientBookingService, PatientBookingsPort, BookingSyncPort, BookingSlotsQuery } from "./ports";
import type { CreatePatientBookingInput } from "./types";

function ensureIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error("invalid_datetime");
  }
  return d.toISOString();
}

function validateCreateInput(input: CreatePatientBookingInput): CreatePatientBookingInput {
  const slotStart = ensureIso(input.slotStart);
  const slotEnd = ensureIso(input.slotEnd);
  if (new Date(slotEnd).getTime() <= new Date(slotStart).getTime()) {
    throw new Error("invalid_slot_range");
  }
  if (!input.contactName.trim()) throw new Error("invalid_contact_name");
  if (!input.contactPhone.trim()) throw new Error("invalid_contact_phone");
  return {
    ...input,
    slotStart,
    slotEnd,
    city: input.city?.trim() || undefined,
    contactName: input.contactName.trim(),
    contactPhone: input.contactPhone.trim(),
    contactEmail: input.contactEmail?.trim() || undefined,
  };
}

function cacheKey(query: BookingSlotsQuery): string {
  return JSON.stringify({
    type: query.type,
    city: query.city ?? "",
    category: query.category,
    date: query.date ?? "",
  });
}

function isPostgresExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23P01";
}

export function createPatientBookingService(input: {
  bookingsPort: PatientBookingsPort;
  syncPort: BookingSyncPort;
  slotsTtlMs?: number;
}): PatientBookingService {
  const slotsTtlMs = input.slotsTtlMs ?? 5 * 60 * 1000;
  const slotsCache = new Map<string, { expiresAt: number; value: Awaited<ReturnType<BookingSyncPort["fetchSlots"]>> }>();

  return {
    async getSlots(query) {
      const key = cacheKey(query);
      const now = Date.now();
      const cached = slotsCache.get(key);
      if (cached && cached.expiresAt > now) {
        return cached.value;
      }
      const value = await input.syncPort.fetchSlots(query);
      slotsCache.set(key, { value, expiresAt: now + slotsTtlMs });
      return value;
    },

    async createBooking(rawInput) {
      const createInput = validateCreateInput(rawInput);
      const pending = await input.bookingsPort.createPending(createInput);
      let sync: { rubitimeId: string | null; raw: Record<string, unknown> };
      try {
        sync = await input.syncPort.createRecord({
          type: createInput.type,
          city: createInput.city,
          category: createInput.category,
          slotStart: createInput.slotStart,
          slotEnd: createInput.slotEnd,
          contactName: createInput.contactName,
          contactPhone: createInput.contactPhone,
          contactEmail: createInput.contactEmail,
        });
      } catch (err) {
        await input.bookingsPort.markFailedSync(pending.id);
        throw new Error("booking_sync_failed");
      }
      let confirmed: Awaited<ReturnType<PatientBookingsPort["markConfirmed"]>>;
      try {
        confirmed = await input.bookingsPort.markConfirmed(pending.id, sync.rubitimeId);
      } catch (err) {
        const slotOverlap =
          (err instanceof Error && err.message === "slot_overlap") || isPostgresExclusionViolation(err);
        if (slotOverlap) {
          if (sync.rubitimeId) {
            try {
              await input.syncPort.cancelRecord(sync.rubitimeId);
            } catch (cancelErr) {
              console.error("[patient-booking] failed to rollback rubitime record after slot overlap", {
                bookingId: pending.id,
                rubitimeId: sync.rubitimeId,
                cancelErr,
              });
            }
          }
          await input.bookingsPort.markCancelled({
            bookingId: pending.id,
            reason: "slot_overlap",
            status: "cancelled",
          });
          throw new Error("slot_overlap");
        }
        console.error("[patient-booking] booking confirm failed after rubitime create", {
          bookingId: pending.id,
          rubitimeId: sync.rubitimeId,
          err,
        });
        throw new Error("booking_confirm_failed");
      }
      const finalized = confirmed ?? pending;
      try {
        await input.syncPort.emitBookingEvent({
          eventType: "booking.created",
          idempotencyKey: `booking.created:${pending.id}`,
          payload: {
            bookingId: finalized.id,
            userId: finalized.userId,
            rubitimeId: finalized.rubitimeId,
            bookingType: finalized.bookingType,
            city: finalized.city ?? undefined,
            category: finalized.category,
            slotStart: finalized.slotStart,
            slotEnd: finalized.slotEnd,
            contactName: finalized.contactName,
            contactPhone: finalized.contactPhone,
            contactEmail: finalized.contactEmail ?? undefined,
          },
        });
      } catch {
        // Integration notifications/reminders are best-effort and must not fail booking confirmation.
      }
      if (confirmed) return confirmed;
      return pending;
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
          return { ok: false, error: "sync_failed" };
        }
      }
      await input.bookingsPort.markCancelled({
        bookingId: row.id,
        reason: cancelInput.reason,
        status: "cancelled",
      });
      try {
        await input.syncPort.emitBookingEvent({
          eventType: "booking.cancelled",
          idempotencyKey: `booking.cancelled:${row.id}`,
          payload: {
            bookingId: row.id,
            userId: row.userId,
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
    },
  };
}
