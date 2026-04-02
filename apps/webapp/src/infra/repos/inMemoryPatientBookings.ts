import { randomUUID } from "node:crypto";
import type { PatientBookingsPort, CreatePendingPatientBookingInput } from "@/modules/patient-booking/ports";
import { computeCompatSyncQuality } from "@/modules/patient-booking/compatSyncQuality";
import type { PatientBookingRecord, PatientBookingStatus } from "@/modules/patient-booking/types";
import { intervalsOverlap } from "@/modules/patient-booking/slotOverlap";
import { normalizeRuPhoneE164 } from "@/shared/phone/normalizeRuPhoneE164";

const byId = new Map<string, PatientBookingRecord>();

/** Test-only: clear all in-memory bookings. */
export function resetInMemoryPatientBookingsStore(): void {
  byId.clear();
}

const BLOCKING_STATUSES = ["creating", "confirmed", "rescheduled", "cancelling", "cancel_failed"] as const;

/** Matches pgPatientBookings `upsertFromRubitime` fallback filter. */
const FALLBACK_NATIVE_STATUSES: readonly PatientBookingStatus[] = ["creating", "confirmed", "failed_sync"];

function isFallbackNativeStatus(status: PatientBookingStatus): boolean {
  return (FALLBACK_NATIVE_STATUSES as readonly string[]).includes(status);
}

function slotMatchesRowAndInput(rowSlot: string, inputSlot: string): boolean {
  if (rowSlot === inputSlot) return true;
  const a = Date.parse(rowSlot);
  const b = Date.parse(inputSlot);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a === b;
}

function hasGlobalSlotOverlap(slotStart: string, slotEnd: string, excludeBookingId?: string): boolean {
  for (const row of byId.values()) {
    if (excludeBookingId !== undefined && row.id === excludeBookingId) continue;
    if (!BLOCKING_STATUSES.includes(row.status as (typeof BLOCKING_STATUSES)[number])) continue;
    if (intervalsOverlap(slotStart, slotEnd, row.slotStart, row.slotEnd)) return true;
  }
  return false;
}

function applyUpsertFromRubitimeToRow(id: string, row: PatientBookingRecord, input: Parameters<PatientBookingsPort["upsertFromRubitime"]>[0]): void {
  const slotStartIso = input.slotStart ?? row.slotStart;
  const explicitSlotEnd = input.slotEnd != null && String(input.slotEnd).trim() !== "";
  const slotEnd =
    explicitSlotEnd
      ? (input.slotEnd as string)
      : new Date(new Date(slotStartIso).getTime() + 60 * 60_000).toISOString();
  const rb = input.rubitimeBranchId?.trim() || null;
  const rs = input.rubitimeServiceId?.trim() || null;
  const compatQuality = computeCompatSyncQuality({
    branchServiceId: null,
    cityCodeSnapshot: null,
    serviceTitleSnapshot: input.serviceTitle ?? row.serviceTitleSnapshot,
    branchTitleSnapshot: input.branchTitle ?? row.branchTitleSnapshot,
    rubitimeBranchId: rb,
    rubitimeServiceId: rs,
    slotEndExplicitFromWebhook: explicitSlotEnd,
    slotEndFromCatalogDuration: false,
  });
  const cancelledAt =
    input.status === "cancelled"
      ? new Date().toISOString()
      : input.status === "rescheduled"
        ? null
        : row.cancelledAt;
  byId.set(id, {
    ...row,
    status: input.status,
    slotStart: slotStartIso,
    slotEnd,
    branchTitleSnapshot: input.branchTitle ?? row.branchTitleSnapshot,
    serviceTitleSnapshot: input.serviceTitle ?? row.serviceTitleSnapshot,
    rubitimeBranchIdSnapshot: input.rubitimeBranchId ?? row.rubitimeBranchIdSnapshot,
    rubitimeServiceIdSnapshot: input.rubitimeServiceId ?? row.rubitimeServiceIdSnapshot,
    rubitimeCooperatorIdSnapshot: input.rubitimeCooperatorId ?? row.rubitimeCooperatorIdSnapshot,
    rubitimeManageUrl: input.rubitimeManageUrl?.trim() || row.rubitimeManageUrl,
    compatQuality: row.bookingSource === "rubitime_projection" ? compatQuality : row.compatQuality,
    provenanceUpdatedBy:
      row.bookingSource === "rubitime_projection" ? "rubitime_external" : row.provenanceUpdatedBy,
    cancelledAt,
    updatedAt: new Date().toISOString(),
  });
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
      rubitimeManageUrl: null,
      bookingSource: "native",
      compatQuality: null,
      provenanceCreatedBy: null,
      provenanceUpdatedBy: null,
    };
    byId.set(row.id, row);
    return row;
  },

  async markConfirmed(bookingId, rubitimeId, options) {
    const row = byId.get(bookingId);
    if (!row) return null;
    if (hasGlobalSlotOverlap(row.slotStart, row.slotEnd, bookingId)) {
      throw new Error("slot_overlap");
    }
    const manage = options?.rubitimeManageUrl?.trim() || null;
    const next = {
      ...row,
      status: "confirmed" as const,
      rubitimeId: rubitimeId ?? row.rubitimeId,
      rubitimeManageUrl: manage ?? row.rubitimeManageUrl,
      updatedAt: new Date().toISOString(),
    };
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
    let targetId: string | undefined;
    let row: PatientBookingRecord | undefined;

    for (const [id, r] of byId.entries()) {
      if (r.rubitimeId === input.rubitimeId) {
        targetId = id;
        row = r;
        break;
      }
    }

    if (!targetId || !row) {
      const phoneRaw = input.contactPhone?.trim() ?? "";
      const slotStartIso = input.slotStart?.trim() ?? "";
      if (phoneRaw && slotStartIso) {
        const phoneNorm = normalizeRuPhoneE164(phoneRaw);
        type Cand = { id: string; row: PatientBookingRecord; createdMs: number };
        const candidates: Cand[] = [];
        for (const [id, r] of byId.entries()) {
          if (r.bookingSource !== "native") continue;
          if (r.rubitimeId != null) continue;
          if (!isFallbackNativeStatus(r.status)) continue;
          const rowPhoneNorm = normalizeRuPhoneE164(r.contactPhone.trim());
          if (rowPhoneNorm !== phoneNorm) continue;
          if (!slotMatchesRowAndInput(r.slotStart, slotStartIso)) continue;
          candidates.push({ id, row: r, createdMs: Date.parse(r.createdAt) });
        }
        if (candidates.length > 0) {
          const best = candidates.reduce((a, b) => (a.createdMs >= b.createdMs ? a : b));
          targetId = best.id;
          const nowIso = new Date().toISOString();
          const linked: PatientBookingRecord = { ...best.row, rubitimeId: input.rubitimeId, updatedAt: nowIso };
          byId.set(targetId, linked);
          row = linked;
        }
      }
    }

    if (targetId && row) {
      applyUpsertFromRubitimeToRow(targetId, row, input);
      return;
    }

    // Compat-create path: external Rubitime record without a native booking row.
    if (!input.slotStart) return;
    const now = new Date().toISOString();
    const explicitSlotEnd = input.slotEnd != null && String(input.slotEnd).trim() !== "";
    const slotEnd = explicitSlotEnd
      ? (input.slotEnd as string)
      : new Date(new Date(input.slotStart).getTime() + 60 * 60_000).toISOString();
    const rb = input.rubitimeBranchId?.trim() || null;
    const rs = input.rubitimeServiceId?.trim() || null;
    const compatQuality = computeCompatSyncQuality({
      branchServiceId: null,
      cityCodeSnapshot: null,
      serviceTitleSnapshot: input.serviceTitle ?? null,
      branchTitleSnapshot: input.branchTitle ?? null,
      rubitimeBranchId: rb,
      rubitimeServiceId: rs,
      slotEndExplicitFromWebhook: explicitSlotEnd,
      slotEndFromCatalogDuration: false,
    });
    const newRow: PatientBookingRecord = {
      id: randomUUID(),
      userId: input.userId ?? null,
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
      rubitimeCooperatorIdSnapshot: input.rubitimeCooperatorId ?? null,
      rubitimeServiceIdSnapshot: input.rubitimeServiceId ?? null,
      rubitimeManageUrl: input.rubitimeManageUrl?.trim() || null,
      bookingSource: "rubitime_projection",
      compatQuality,
      provenanceCreatedBy: "rubitime_external",
      provenanceUpdatedBy: null,
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
