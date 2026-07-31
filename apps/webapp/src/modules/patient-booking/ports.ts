import type {
  BookingCategory,
  BookingContactFioInput,
  BookingSlotsByDate,
  BookingType,
  CancelPatientBookingInput,
  CreatePatientBookingInput,
  PatientBookingRecord,
  PatientBookingStatus,
} from './types';

/** Patient-facing slots query (cabinet / public booking API). */
export type BookingSlotsQuery =
  | {
      type: 'online';
      /** Trusted server-side tenant context; never accepted directly from public client query. */
      organizationId?: string;
      category: BookingCategory;
      date?: string;
      slotCount?: number;
    }
  | {
      type: 'in_person';
      /** Trusted server-side tenant context derived from canonical branch/service. */
      organizationId?: string;
      branchId: string;
      serviceId: string;
      date?: string;
      slotCount?: number;
    };

/** Doctor cabinet compatibility projection. */
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
};

export type BookingSyncPort = {
  emitBookingEvent(input: {
    eventType:
      | 'booking.created'
      | 'booking.cancelled'
      | 'booking.rescheduled'
      | 'booking.reschedule_requested'
      | 'booking.deleted'
      | 'booking.payment_captured'
      | 'booking.package_linked'
      | 'booking.package_unlinked';
    idempotencyKey: string;
    payload: {
      organizationId?: string;
      bookingId: string;
      userId: string;
      bookingType: BookingType;
      city?: string;
      category: BookingCategory;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
      reason?: string;
      cityCodeSnapshot?: string | null;
      serviceTitleSnapshot?: string | null;
      canonicalAppointmentId?: string;
      /** Webapp-resolved clinic policy; absent keeps compatibility with older senders. */
      reminderPlan?: {
        enabled: boolean;
        offsetsMinutes: number[];
      };
      /** R21: врач снял «Уведомлять пациента» — интегратор не шлёт пациентские каналы/web-push (врач/GCal — как обычно). */
      suppressPatientNotification?: boolean;
    };
  }): Promise<void>;
};

export type PatientBookingsPort = {
  createPending(input: CreatePendingPatientBookingInput): Promise<PatientBookingRecord>;
  markConfirmed(
    bookingId: string,
    options?: { canonicalAppointmentId?: string | null },
  ): Promise<PatientBookingRecord | null>;
  markAwaitingPayment(
    bookingId: string,
    canonicalAppointmentId: string,
  ): Promise<PatientBookingRecord | null>;
  markConfirmedByCanonicalAppointment(
    canonicalAppointmentId: string,
  ): Promise<PatientBookingRecord | null>;
  markFailedSync(bookingId: string): Promise<void>;
  markCancelling(bookingId: string): Promise<PatientBookingRecord | null>;
  markCancelled(input: {
    bookingId: string;
    reason?: string;
    status?: PatientBookingStatus;
  }): Promise<PatientBookingRecord | null>;
  getByIdForUser(bookingId: string, userId: string): Promise<PatientBookingRecord | null>;
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
  resolveBookingOrganizationId(bookingId: string): Promise<string | null>;
  getBookingPaymentStatus(
    bookingId: string,
    userId: string,
  ): Promise<
    | {
        ok: true;
        booking: PatientBookingRecord;
        summary: import('@/modules/payments/types').AppointmentPaymentSummary | null;
        intentId: string | null;
      }
    | { ok: false; error: 'not_found' }
  >;
  getBookingPaymentStatusForContact(
    bookingId: string,
    contactPhone: string,
  ): Promise<
    | {
        ok: true;
        booking: PatientBookingRecord;
        summary: import('@/modules/payments/types').AppointmentPaymentSummary | null;
        intentId: string | null;
      }
    | { ok: false; error: 'not_found' | 'forbidden' }
  >;
  getBookingByCanonicalAppointment(
    canonicalAppointmentId: string,
  ): Promise<PatientBookingRecord | null>;
  syncLinkedPatientBookingCancelled(input: {
    canonicalAppointmentId: string;
    reason?: string;
  }): Promise<void>;
  cancelBooking(input: CancelPatientBookingInput): Promise<
    | {
        ok: true;
        lateCancellation?: boolean;
        notificationOutcomeFailed?: boolean;
        paymentOutcomeFailed?: boolean;
        membershipOutcomeFailed?: boolean;
        productOutcomeFailed?: boolean;
      }
    | {
        ok: false;
        error:
          | 'not_found'
          | 'sync_failed'
          | 'lifecycle_failed'
          | 'already_cancelled'
          | 'not_allowed'
          | 'staff_confirmation_required';
      }
  >;
  previewCancel(input: {
    userId: string;
    bookingId: string;
  }): Promise<
    | { ok: true; isFree: boolean; allowed: boolean; messageKey: string }
    | { ok: false; error: 'not_found' | 'no_canonical' }
  >;
  rescheduleBooking(input: {
    userId: string;
    bookingId: string;
    slotStart: string;
    slotEnd: string;
    reason?: string;
  }): Promise<
    | {
        ok: true;
        booking: PatientBookingRecord;
        notificationOutcomeFailed?: boolean;
        paymentOutcomeFailed?: boolean;
      }
    | {
        ok: false;
        error:
          | 'not_found'
          | 'no_canonical'
          | 'canonical_appointment_incomplete'
          | 'too_late'
          | 'limit_exceeded'
          | 'change_not_allowed'
          | 'staff_confirmation_required'
          | 'slot_overlap'
          | 'sync_failed';
      }
  >;
  previewReschedule(input: {
    userId: string;
    bookingId: string;
  }): Promise<
    | { ok: true; allowed: boolean; messageKey: string; remainingSelfReschedules: number }
    | { ok: false; error: 'not_found' | 'no_canonical' | 'canonical_appointment_incomplete' }
  >;
  listMyBookings(userId: string): Promise<{
    upcoming: PatientBookingRecord[];
    history: PatientBookingRecord[];
  }>;
};
