import { randomUUID } from "node:crypto";
import type { PatientBookingsPort, CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import type { PatientBookingRecord } from "@/modules/patient-booking/types";
import { intervalsOverlap } from "@/modules/patient-booking/slotOverlap";

const byId = new Map<string, PatientBookingRecord>();

/** Test-only: clear all in-memory bookings. */
export function resetInMemoryPatientBookingsStore(): void {
  byId.clear();
}

const BLOCKING_STATUSES = ["confirmed", "rescheduled"] as const;

function hasGlobalSlotOverlap(slotStart: string, slotEnd: string, excludeBookingId?: string): boolean {
  for (const row of byId.values()) {
    if (excludeBookingId !== undefined && row.id === excludeBookingId) continue;
    if (!BLOCKING_STATUSES.includes(row.status as (typeof BLOCKING_STATUSES)[number])) continue;
    if (intervalsOverlap(slotStart, slotEnd, row.slotStart, row.slotEnd)) return true;
  }
  return false;
}

export const inMemoryPatientBookingsPort: PatientBookingsPort = {
  async createPending(input: CreatePendingPatientBookingInput) {
    if (hasGlobalSlotOverlap(input.slotStart, input.slotEnd)) {
      throw new Error("slot_overlap");
    }
    const now = new Date().toISOString();
    const row: PatientBookingRecord = {
      id: randomUUID(),
      userId: input.userId,
      bookingType: input.bookingType,
      city: input.city,
      category: input.category,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: "creating",
      cancelledAt: null,
      cancelReason: null,
      rubitimeId: null,
      gcalEventId: null,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      reminder24hSent: false,
      reminder2hSent: false,
      createdAt: now,
      updatedAt: now,
      branchServiceId: input.branchServiceId,
      branchId: input.branchId,
      serviceId: input.serviceId,
      cityCodeSnapshot: input.cityCodeSnapshot,
      branchTitleSnapshot: input.branchTitleSnapshot,
      serviceTitleSnapshot: input.serviceTitleSnapshot,
      durationMinutesSnapshot: input.durationMinutesSnapshot,
      priceMinorSnapshot: input.priceMinorSnapshot,
      rubitimeBranchIdSnapshot: input.rubitimeBranchIdSnapshot,
      rubitimeCooperatorIdSnapshot: input.rubitimeCooperatorIdSnapshot,
      rubitimeServiceIdSnapshot: input.rubitimeServiceIdSnapshot,
    };
    byId.set(row.id, row);
    return row;
  },

  async markConfirmed(bookingId, rubitimeId) {
    const row = byId.get(bookingId);
    if (!row) return null;
    if (hasGlobalSlotOverlap(row.slotStart, row.slotEnd, bookingId)) {
      throw new Error("slot_overlap");
    }
    const next = { ...row, status: "confirmed" as const, rubitimeId: rubitimeId ?? row.rubitimeId, updatedAt: new Date().toISOString() };
    byId.set(bookingId, next);
    return next;
  },

  async markFailedSync(bookingId) {
    const row = byId.get(bookingId);
    if (!row) return;
    byId.set(bookingId, { ...row, status: "failed_sync", updatedAt: new Date().toISOString() });
  },

  async markCancelling(bookingId) {
    const row = byId.get(bookingId);
    if (!row) return null;
    const next = { ...row, status: "cancelling" as const, updatedAt: new Date().toISOString() };
    byId.set(bookingId, next);
    return next;
  },

  async markCancelled(input) {
    const row = byId.get(input.bookingId);
    if (!row) return null;
    const next = {
      ...row,
      status: input.status ?? "cancelled",
      cancelReason: input.reason ?? row.cancelReason,
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    byId.set(input.bookingId, next);
    return next;
  },

  async getByIdForUser(bookingId, userId) {
    const row = byId.get(bookingId);
    if (!row || row.userId !== userId) return null;
    return row;
  },

  async getByRubitimeId(rubitimeId) {
    for (const row of byId.values()) {
      if (row.rubitimeId === rubitimeId) return row;
    }
    return null;
  },

  async upsertFromRubitime(input) {
    for (const [id, row] of byId.entries()) {
      if (row.rubitimeId !== input.rubitimeId) continue;
      byId.set(id, {
        ...row,
        status: input.status,
        slotStart: input.slotStart ?? row.slotStart,
        slotEnd: input.slotEnd ?? row.slotEnd,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    // Compat-create path: external Rubitime record without a native booking row.
    if (!input.slotStart) return;
    const now = new Date().toISOString();
    const slotEnd =
      input.slotEnd ??
      new Date(new Date(input.slotStart).getTime() + 60 * 60_000).toISOString();
    const newRow: PatientBookingRecord = {
      id: randomUUID(),
      userId: input.userId ?? "compat-unknown",
      bookingType: "in_person",
      city: null,
      category: "general",
      slotStart: input.slotStart,
      slotEnd,
      status: input.status,
      cancelledAt: null,
      cancelReason: null,
      rubitimeId: input.rubitimeId,
      gcalEventId: null,
      contactPhone: input.contactPhone ?? "",
      contactEmail: null,
      contactName: input.contactName ?? "",
      reminder24hSent: false,
      reminder2hSent: false,
      createdAt: now,
      updatedAt: now,
      branchServiceId: null,
      branchId: null,
      serviceId: null,
      cityCodeSnapshot: null,
      branchTitleSnapshot: input.branchTitle ?? null,
      serviceTitleSnapshot: input.serviceTitle ?? null,
      durationMinutesSnapshot: null,
      priceMinorSnapshot: null,
      rubitimeBranchIdSnapshot: input.rubitimeBranchId ?? null,
      rubitimeCooperatorIdSnapshot: null,
      rubitimeServiceIdSnapshot: input.rubitimeServiceId ?? null,
    };
    byId.set(newRow.id, newRow);
  },

  async listUpcomingByUser(userId, nowIso) {
    const nowMs = new Date(nowIso).getTime();
    return [...byId.values()]
      .filter((row) => row.userId === userId)
      .filter((row) => ["creating", "confirmed", "rescheduled", "cancelling", "cancel_failed"].includes(row.status))
      .filter((row) => new Date(row.slotStart).getTime() >= nowMs)
      .sort((a, b) => a.slotStart.localeCompare(b.slotStart));
  },

  async listHistoryByUser(userId, nowIso) {
    const nowMs = new Date(nowIso).getTime();
    return [...byId.values()]
      .filter((row) => row.userId === userId)
      .filter(
        (row) =>
          new Date(row.slotStart).getTime() < nowMs ||
          ["cancelled", "completed", "no_show", "failed_sync"].includes(row.status),
      )
      .sort((a, b) => b.slotStart.localeCompare(a.slotStart));
  },
};
