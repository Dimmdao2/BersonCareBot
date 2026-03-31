import type {
  BookingCategory,
  BookingSlotsByDate,
  BookingType,
  CancelPatientBookingInput,
  CreatePatientBookingInput,
  PatientBookingRecord,
  PatientBookingStatus,
} from "./types";

export type BookingSlotsQuery = {
  type: BookingType;
  city?: string;
  category: BookingCategory;
  date?: string;
};

export type CreateBookingSyncInput = {
  type: BookingType;
  city?: string;
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
};

export type BookingSyncPort = {
  fetchSlots(query: BookingSlotsQuery): Promise<BookingSlotsByDate[]>;
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
    };
  }): Promise<void>;
};

export type PatientBookingsPort = {
  createPending(input: CreatePatientBookingInput): Promise<PatientBookingRecord>;
  markConfirmed(bookingId: string, rubitimeId: string | null): Promise<PatientBookingRecord | null>;
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
  }): Promise<void>;
};
