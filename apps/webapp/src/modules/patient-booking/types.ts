import type { CompatSyncQuality } from "./compatSyncQuality";

export type BookingType = "in_person" | "online";
export type BookingCategory = "rehab_lfk" | "nutrition" | "general";

export type PatientBookingRowSource = "native" | "rubitime_projection";

export type PatientBookingStatus =
  | "creating"
  | "confirmed"
  | "cancelling"
  | "cancel_failed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show"
  | "failed_sync";

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
  /** Null only for unlinked `source=rubitime_projection` compat rows (phone not matched yet). */
  userId: string | null;
  bookingType: BookingType;
  city: string | null;
  category: BookingCategory;
  slotStart: string;
  slotEnd: string;
  status: PatientBookingStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  rubitimeId: string | null;
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
  rubitimeBranchIdSnapshot: string | null;
  rubitimeCooperatorIdSnapshot: string | null;
  rubitimeServiceIdSnapshot: string | null;
  /** DB `source`: native webapp booking vs Rubitime projection compat row. */
  bookingSource: PatientBookingRowSource;
  /** Set for `rubitime_projection` rows; recomputed on each compat upsert. */
  compatQuality: CompatSyncQuality | null;
  provenanceCreatedBy: string | null;
  provenanceUpdatedBy: string | null;
};

/** API / UI input for creating a booking (discriminated by `type`). */
export type CreatePatientBookingInput =
  | {
      userId: string;
      type: "online";
      category: BookingCategory;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
    }
  | {
      userId: string;
      type: "in_person";
      /** Catalog row `booking_branch_services.id` */
      branchServiceId: string;
      /** IANA-ish code from `booking_cities.code` (e.g. moscow, spb) */
      cityCode: string;
      slotStart: string;
      slotEnd: string;
      contactName: string;
      contactPhone: string;
      contactEmail?: string;
    };

export type CancelPatientBookingInput = {
  userId: string;
  bookingId: string;
  reason?: string;
};
