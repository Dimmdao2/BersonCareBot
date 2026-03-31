export type BookingType = "in_person" | "online";
export type BookingCategory = "rehab_lfk" | "nutrition" | "general";

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

export type PatientBookingRecord = {
  id: string;
  userId: string;
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
};

export type CreatePatientBookingInput = {
  userId: string;
  type: BookingType;
  city?: string;
  category: BookingCategory;
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
