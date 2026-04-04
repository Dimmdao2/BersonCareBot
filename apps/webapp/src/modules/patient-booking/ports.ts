import type {
  BookingCategory,
  BookingSlotsByDate,
  BookingType,
  CancelPatientBookingInput,
  CreatePatientBookingInput,
  PatientBookingRecord,
  PatientBookingStatus,
} from "./types";

/** Patient-facing slots query (cabinet / public booking API). */
export type BookingSlotsQuery =
  | {
      type: "online";
      category: BookingCategory;
      date?: string;
    }
  | {
      type: "in_person";
      branchServiceId: string;
      date?: string;
    };

/**
 * Payload to integrator `/rubitime/slots`.
 * v1: online only. v2: explicit Rubitime IDs + slot duration to expand `times[]`.
 */
export type BookingSlotsIntegratorQuery =
  | {
      version?: undefined;
      type: "online";
      category: BookingCategory;
      city?: string;
      date?: string;
    }
  | {
      version: "v2";
      rubitimeBranchId: string;
      rubitimeCooperatorId: string;
      rubitimeServiceId: string;
      slotDurationMinutes: number;
      /** IANA zone for Rubitime wall-clock times[] (from booking catalog branch). */
      branchTimezone: string;
      date?: string;
    };

export type CreateBookingSyncInput =
  | {
      version?: undefined;
      type: BookingType;
      city?: string;
      category: BookingCategory;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
    }
  | {
      version: "v2";
      rubitimeBranchId: string;
      rubitimeCooperatorId: string;
      rubitimeServiceId: string;
      slotStart: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      localBookingId: string;
    };

/** Flat row written by `createPending` (service maps from API + catalog). */
export type CreatePendingPatientBookingInput = {
  userId: string;
  bookingType: BookingType;
  city: string | null;
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  branchId: string | null;
  serviceId: string | null;
  branchServiceId: string | null;
  cityCodeSnapshot: string | null;
  branchTitleSnapshot: string | null;
  serviceTitleSnapshot: string | null;
  durationMinutesSnapshot: number | null;
  priceMinorSnapshot: number | null;
  rubitimeBranchIdSnapshot: string | null;
  rubitimeCooperatorIdSnapshot: string | null;
  rubitimeServiceIdSnapshot: string | null;
};

export type BookingSyncPort = {
  fetchSlots(query: BookingSlotsIntegratorQuery): Promise<BookingSlotsByDate[]>;
  createRecord(input: CreateBookingSyncInput): Promise<{ rubitimeId: string | null; raw: Record<string, unknown> }>;
  cancelRecord(rubitimeId: string): Promise<void>;
  emitBookingEvent(input: {
    eventType: "booking.created" | "booking.cancelled";
    idempotencyKey: string;
    payload: {
      bookingId: string;
      userId: string;
      rubitimeId?: string | null;
      bookingType: BookingType;
      city?: string;
      category: BookingCategory;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      reason?: string;
      branchServiceId?: string | null;
      cityCodeSnapshot?: string | null;
      serviceTitleSnapshot?: string | null;
    };
  }): Promise<void>;
};

export type PatientBookingsPort = {
  createPending(input: CreatePendingPatientBookingInput): Promise<PatientBookingRecord>;
  markConfirmed(
    bookingId: string,
    rubitimeId: string | null,
    options?: { rubitimeManageUrl?: string | null },
  ): Promise<PatientBookingRecord | null>;
  markFailedSync(bookingId: string): Promise<void>;
  markCancelling(bookingId: string): Promise<PatientBookingRecord | null>;
  markCancelled(input: {
    bookingId: string;
    reason?: string;
    status?: PatientBookingStatus;
  }): Promise<PatientBookingRecord | null>;
  getByIdForUser(bookingId: string, userId: string): Promise<PatientBookingRecord | null>;
  getByRubitimeId(rubitimeId: string): Promise<PatientBookingRecord | null>;
  upsertFromRubitime(input: {
    rubitimeId: string;
    status: PatientBookingStatus;
    slotStart?: string | null;
    slotEnd?: string | null;
    /** Enriched fields from Rubitime webhook payload for compat-sync create path. */
    userId?: string | null;
    contactPhone?: string | null;
    contactName?: string | null;
    branchTitle?: string | null;
    serviceTitle?: string | null;
    rubitimeBranchId?: string | null;
    rubitimeServiceId?: string | null;
    /** Disambiguates `booking_branch_services` when multiple specialists share branch+service. */
    rubitimeCooperatorId?: string | null;
    /** Exact Rubitime HTTPS URL for the record (webhook / projection). */
    rubitimeManageUrl?: string | null;
  }): Promise<void>;
  listUpcomingByUser(userId: string, nowIso: string): Promise<PatientBookingRecord[]>;
  listHistoryByUser(userId: string, nowIso: string): Promise<PatientBookingRecord[]>;
};

export type PatientBookingService = {
  getSlots(query: BookingSlotsQuery): Promise<BookingSlotsByDate[]>;
  createBooking(input: CreatePatientBookingInput): Promise<PatientBookingRecord>;
  cancelBooking(input: CancelPatientBookingInput): Promise<
    | { ok: true }
    | { ok: false; error: "not_found" | "sync_failed" | "already_cancelled" }
  >;
  listMyBookings(userId: string): Promise<{
    upcoming: PatientBookingRecord[];
    history: PatientBookingRecord[];
  }>;
  applyRubitimeUpdate(input: {
    rubitimeId: string;
    status: PatientBookingStatus;
    slotStart?: string | null;
    slotEnd?: string | null;
    userId?: string | null;
    contactPhone?: string | null;
    contactName?: string | null;
    branchTitle?: string | null;
    serviceTitle?: string | null;
    rubitimeBranchId?: string | null;
    rubitimeServiceId?: string | null;
    rubitimeCooperatorId?: string | null;
    rubitimeManageUrl?: string | null;
  }): Promise<void>;
};
