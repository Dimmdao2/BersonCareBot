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
      slotCount?: number;
    }
  | {
      type: "in_person";
      branchServiceId: string;
      date?: string;
      slotCount?: number;
    };

/** Doctor cabinet projection (`appointment_records`). */
export type AppointmentProjectionPort = {
  upsertRecordFromProjection(params: {
    integratorRecordId: string;
    phoneNormalized: string | null;
    recordAt: string | null;
    status: string;
    payloadJson: Record<string, unknown>;
    lastEvent: string;
    updatedAt: string;
    branchId?: string | null;
  }): Promise<void>;
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
  /** Отмена в Rubitime (status canceled), не удаление записи. */
  cancelRecord(rubitimeId: string): Promise<void>;
  /** Удаление записи в Rubitime (освобождение слота / откат create). */
  deleteRecord(rubitimeId: string): Promise<void>;
  updateRecord?(input: {
    rubitimeId: string;
    slotStart: string;
    slotEnd?: string;
    /** Normalized Rubitime API2 fields (record, datetime_end, branch_id, …). */
    rubitimePatch?: Record<string, unknown>;
  }): Promise<void>;
  emitBookingEvent(input: {
    eventType:
      | "booking.created"
      | "booking.cancelled"
      | "booking.rescheduled"
      | "booking.reschedule_requested"
      | "booking.deleted"
      | "booking.payment_captured"
      | "booking.package_linked"
      | "booking.package_unlinked";
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
      canonicalAppointmentId?: string;
    };
  }): Promise<void>;
};

export type PatientBookingsPort = {
  createPending(input: CreatePendingPatientBookingInput): Promise<PatientBookingRecord>;
  markConfirmed(
    bookingId: string,
    rubitimeId: string | null,
    options?: { rubitimeManageUrl?: string | null; canonicalAppointmentId?: string | null },
  ): Promise<PatientBookingRecord | null>;
  markAwaitingPayment(
    bookingId: string,
    canonicalAppointmentId: string,
    options?: { rubitimeId?: string | null; rubitimeManageUrl?: string | null },
  ): Promise<PatientBookingRecord | null>;
  markConfirmedByCanonicalAppointment(
    canonicalAppointmentId: string,
    rubitimeId?: string | null,
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
  getById(bookingId: string): Promise<PatientBookingRecord | null>;
  getByCanonicalAppointmentId(canonicalAppointmentId: string): Promise<PatientBookingRecord | null>;
  listUpcomingByUser(userId: string, nowIso: string): Promise<PatientBookingRecord[]>;
  listHistoryByUser(userId: string, nowIso: string): Promise<PatientBookingRecord[]>;
  updateSlotsAfterReschedule(input: {
    bookingId: string;
    slotStart: string;
    slotEnd: string;
    status?: PatientBookingStatus;
  }): Promise<PatientBookingRecord | null>;
};

export type PatientBookingService = {
  getSlots(query: BookingSlotsQuery): Promise<BookingSlotsByDate[]>;
  createBooking(input: CreatePatientBookingInput): Promise<PatientBookingRecord>;
  getBookingPaymentStatus(
    bookingId: string,
    userId: string,
  ): Promise<
    | {
        ok: true;
        booking: PatientBookingRecord;
        summary: import("@/modules/payments/types").AppointmentPaymentSummary | null;
        intentId: string | null;
      }
    | { ok: false; error: "not_found" }
  >;
  getBookingPaymentStatusForContact(
    bookingId: string,
    contactPhone: string,
  ): Promise<
    | {
        ok: true;
        booking: PatientBookingRecord;
        summary: import("@/modules/payments/types").AppointmentPaymentSummary | null;
        intentId: string | null;
      }
    | { ok: false; error: "not_found" | "forbidden" }
  >;
  listPaymentHistory(userId: string): Promise<
    import("@/modules/payments/types").PaymentHistoryEventRecord[]
  >;
  getBookingByCanonicalAppointment(canonicalAppointmentId: string): Promise<PatientBookingRecord | null>;
  getByRubitimeId(rubitimeId: string): Promise<PatientBookingRecord | null>;
  cancelBooking(input: CancelPatientBookingInput): Promise<
    | {
        ok: true;
        lateCancellation?: boolean;
        rubitimeMirrorFailed?: boolean;
        paymentOutcomeFailed?: boolean;
        membershipOutcomeFailed?: boolean;
        productOutcomeFailed?: boolean;
      }
    | {
        ok: false;
        error:
          | "not_found"
          | "sync_failed"
          | "lifecycle_failed"
          | "already_cancelled"
          | "not_allowed"
          | "staff_confirmation_required";
      }
  >;
  previewCancel(input: { userId: string; bookingId: string }): Promise<
    | { ok: true; isFree: boolean; allowed: boolean; messageKey: string }
    | { ok: false; error: "not_found" | "no_canonical" }
  >;
  rescheduleBooking(input: {
    userId: string;
    bookingId: string;
    slotStart: string;
    slotEnd: string;
    reason?: string;
  }): Promise<
    | { ok: true; booking: PatientBookingRecord; rubitimeMirrorFailed?: boolean }
    | {
        ok: false;
        error:
          | "not_found"
          | "no_canonical"
          | "too_late"
          | "limit_exceeded"
          | "change_not_allowed"
          | "staff_confirmation_required"
          | "slot_overlap"
          | "sync_failed";
      }
  >;
  previewReschedule(input: { userId: string; bookingId: string }): Promise<
    | { ok: true; allowed: boolean; messageKey: string; remainingSelfReschedules: number }
    | { ok: false; error: "not_found" | "no_canonical" }
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
