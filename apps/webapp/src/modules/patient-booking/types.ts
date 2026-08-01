import type { BookingAttribution } from '@/modules/booking-attribution/types';

export type PatientBookingChannel = 'app' | 'public_widget';

export type BookingType = 'in_person' | 'online';
export type BookingCategory = 'rehab_lfk' | 'nutrition' | 'general';

/**
 * Canonical in-person context read from the linked `be_appointments` row and
 * its active canonical catalog availability. It is deliberately separate from
 * the legacy `patient_bookings` catalog/snapshot fields below: those columns
 * are retained only for trace/archive compatibility.
 */
export type CanonicalInPersonBookingContext = {
  branchId: string;
  serviceId: string;
  cityCode: string;
  branchTitle: string;
  serviceTitle: string;
  durationMinutes: number;
  priceMinor: number;
};

export type PatientBookingStatus =
  | 'creating'
  | 'awaiting_payment'
  | 'confirmed'
  | 'cancelling'
  | 'cancel_failed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'no_show'
  | 'failed_sync';

export type BookingSlot = {
  startAt: string;
  endAt: string;
};

export type BookingSlotsByDate = {
  date: string;
  slots: BookingSlot[];
};

/**
 * Native booking row. For in-person v2, `category` is kept as DB placeholder (`general`);
 * user-facing copy uses `serviceTitleSnapshot` / `cityCodeSnapshot` when present.
 */
export type PatientBookingRecord = {
  id: string;
  userId: string | null;
  bookingType: BookingType;
  city: string | null;
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  status: PatientBookingStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  gcalEventId: string | null;
  contactPhone: string;
  contactEmail: string | null;
  contactName: string;
  reminder24hSent: boolean;
  reminder2hSent: boolean;
  createdAt: string;
  updatedAt: string;
  branchServiceId: string | null;
  branchId: string | null;
  serviceId: string | null;
  cityCodeSnapshot: string | null;
  branchTitleSnapshot: string | null;
  serviceTitleSnapshot: string | null;
  durationMinutesSnapshot: number | null;
  priceMinorSnapshot: number | null;
  /** Canonical `be_appointments.id` when write path uses booking engine (stage 2+). */
  canonicalAppointmentId: string | null;
  /**
   * Complete canonical view model for an in-person appointment. Null means
   * that this row must not navigate to canonical slots; legacy columns are not
   * a substitute for it.
   */
  canonicalInPersonContext?: CanonicalInPersonBookingContext | null;
  provenanceCreatedBy: string | null;
  provenanceUpdatedBy: string | null;
};

export type BookingFormAnswerInput = { fieldKey: string; value: string };
export type BookingContactFioInput = {
  lastName: string;
  firstName: string;
  patronymic?: string;
};

type CreatePatientBookingCommon = {
  userId: string;
  /** Trusted server-side tenant context; never accepted directly from public client JSON. */
  organizationId?: string;
  bookingChannel?: PatientBookingChannel;
  attribution?: BookingAttribution;
  /** Number of adjacent per-service appointments to create; defaults to one. */
  slotCount?: number;
};

/** API / UI input for creating a booking (discriminated by `type`). */
export type CreatePatientBookingInput =
  | (CreatePatientBookingCommon & {
      type: 'online';
      category: BookingCategory;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactFio?: BookingContactFioInput;
      contactPhone: string;
      contactEmail?: string;
      formAnswers?: BookingFormAnswerInput[];
    })
  | (CreatePatientBookingCommon & {
      type: 'in_person';
      /** Canonical branch and clinic-service ids. */
      branchId: string;
      serviceId: string;
      cityCode: string;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactFio?: BookingContactFioInput;
      contactPhone: string;
      contactEmail?: string;
      formAnswers?: BookingFormAnswerInput[];
      /** Active patient package to reserve a visit against (in-person). */
      patientPackageId?: string;
    });

/** Public create (no session): phone identifies patient; userId resolved server-side. */
export type PublicCreateBookingInput = Omit<CreatePatientBookingInput, 'userId'> & {
  userId?: string;
};

export type CancelPatientBookingInput = {
  userId: string;
  bookingId: string;
  reason?: string;
};
