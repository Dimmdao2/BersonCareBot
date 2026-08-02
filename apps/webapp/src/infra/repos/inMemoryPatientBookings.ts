import { randomUUID } from 'node:crypto';
import type {
  CreatePendingPatientBookingInput,
  PatientBookingsPort,
} from '@/modules/patient-booking/ports';
import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { intervalsOverlap } from '@/modules/patient-booking/slotOverlap';

const byId = new Map<string, PatientBookingRecord>();

/** Test-only: clear all in-memory bookings. */
export function resetInMemoryPatientBookingsStore(): void {
  byId.clear();
}

const BLOCKING_STATUSES = [
  'creating',
  'awaiting_payment',
  'confirmed',
  'rescheduled',
  'cancelling',
  'cancel_failed',
] as const;

function isAbandonedCreating(row: PatientBookingRecord): boolean {
  return row.status === 'creating' && row.canonicalAppointmentId == null;
}

function reconcileAbandonedCreating(input: {
  userId: string;
  slotStart: string;
  slotEnd: string;
}): void {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [id, row] of byId) {
    if (!isAbandonedCreating(row)) continue;
    const sameUserRetry =
      row.userId === input.userId &&
      intervalsOverlap(input.slotStart, input.slotEnd, row.slotStart, row.slotEnd);
    const stale = Date.parse(row.createdAt) < cutoff;
    if (sameUserRetry || stale) {
      byId.set(id, { ...row, status: 'failed_sync', updatedAt: new Date().toISOString() });
    }
  }
}

function hasUserSlotOverlap(input: {
  slotStart: string;
  slotEnd: string;
  userId: string | null;
  excludeBookingId?: string;
}): boolean {
  for (const row of byId.values()) {
    if (input.excludeBookingId !== undefined && row.id === input.excludeBookingId) continue;
    if (!BLOCKING_STATUSES.includes(row.status as (typeof BLOCKING_STATUSES)[number])) continue;
    if (isAbandonedCreating(row)) continue;
    if (row.userId !== input.userId) continue;
    if (intervalsOverlap(input.slotStart, input.slotEnd, row.slotStart, row.slotEnd)) return true;
  }
  return false;
}

export const inMemoryPatientBookingsPort: PatientBookingsPort = {
  async createPending(input: CreatePendingPatientBookingInput) {
    reconcileAbandonedCreating(input);
    if (
      hasUserSlotOverlap({
        slotStart: input.slotStart,
        slotEnd: input.slotEnd,
        userId: input.userId,
      })
    ) {
      throw new Error('slot_overlap');
    }
    const now = new Date().toISOString();
    const row: PatientBookingRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      bookingType: input.bookingType,
      city: input.city,
      category: input.category,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: 'creating',
      cancelledAt: null,
      cancelReason: null,
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
      canonicalAppointmentId: null,
      provenanceCreatedBy: null,
      provenanceUpdatedBy: null,
    };
    byId.set(row.id, row);
    return row;
  },

  async markAwaitingPayment(bookingId, canonicalAppointmentId) {
    const row = byId.get(bookingId);
    if (!row) return null;
    const next = {
      ...row,
      status: 'awaiting_payment' as const,
      canonicalAppointmentId,
      updatedAt: new Date().toISOString(),
    };
    byId.set(bookingId, next);
    return next;
  },

  async markConfirmedByCanonicalAppointment(canonicalAppointmentId) {
    for (const [id, row] of byId) {
      if (
        row.canonicalAppointmentId === canonicalAppointmentId &&
        row.status === 'awaiting_payment'
      ) {
        return this.markConfirmed(id, { canonicalAppointmentId });
      }
    }
    return null;
  },

  async markConfirmed(bookingId, options) {
    const row = byId.get(bookingId);
    if (!row) return null;
    if (
      hasUserSlotOverlap({
        slotStart: row.slotStart,
        slotEnd: row.slotEnd,
        userId: row.userId,
        excludeBookingId: bookingId,
      })
    ) {
      throw new Error('slot_overlap');
    }
    const next = {
      ...row,
      status: 'confirmed' as const,
      canonicalAppointmentId: options?.canonicalAppointmentId?.trim() || row.canonicalAppointmentId,
      updatedAt: new Date().toISOString(),
    };
    byId.set(bookingId, next);
    return next;
  },

  async markFailedSync(bookingId) {
    const row = byId.get(bookingId);
    if (!row) return;
    byId.set(bookingId, { ...row, status: 'failed_sync', updatedAt: new Date().toISOString() });
  },

  async markCancelling(bookingId) {
    const row = byId.get(bookingId);
    if (!row) return null;
    const next = { ...row, status: 'cancelling' as const, updatedAt: new Date().toISOString() };
    byId.set(bookingId, next);
    return next;
  },

  async markCancelled(input) {
    const row = byId.get(input.bookingId);
    if (!row) return null;
    const next = {
      ...row,
      status: input.status ?? 'cancelled',
      cancelReason: input.reason ?? row.cancelReason,
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    byId.set(input.bookingId, next);
    return next;
  },

  async updateSlotsAfterReschedule(input) {
    const row = byId.get(input.bookingId);
    if (!row) return null;
    const next = {
      ...row,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: input.status ?? row.status,
      updatedAt: new Date().toISOString(),
    };
    byId.set(input.bookingId, next);
    return next;
  },

  async getById(bookingId) {
    return byId.get(bookingId) ?? null;
  },

  async getByCanonicalAppointmentId(canonicalAppointmentId) {
    for (const row of byId.values()) {
      if (row.canonicalAppointmentId === canonicalAppointmentId) return row;
    }
    return null;
  },

  async getByIdForUser(bookingId, userId) {
    const row = byId.get(bookingId);
    return row?.userId === userId ? row : null;
  },

  async listUpcomingByUser(userId, nowIso) {
    const nowMs = new Date(nowIso).getTime();
    return [...byId.values()]
      .filter((row) => row.userId === userId)
      .filter((row) =>
        [
          'creating',
          'awaiting_payment',
          'confirmed',
          'rescheduled',
          'cancelling',
          'cancel_failed',
        ].includes(row.status),
      )
      .filter((row) => !isAbandonedCreating(row))
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
          ['cancelled', 'completed', 'no_show', 'failed_sync'].includes(row.status),
      )
      .sort((a, b) => b.slotStart.localeCompare(a.slotStart));
  },
};
