import type { PatientBookingRecord } from "@/modules/patient-booking/types";

export type PrepaymentResolveContext = {
  onlineCategory?: string | null;
  servicePriceMinor?: number | null;
};

/** Maps patient_bookings row to prepayment quote inputs for canonical appointment. */
export function prepaymentContextFromBooking(
  row: PatientBookingRecord | null | undefined,
): PrepaymentResolveContext | undefined {
  if (!row) return undefined;
  if (row.bookingType === "online") {
    return { onlineCategory: row.category, servicePriceMinor: null };
  }
  return { onlineCategory: null, servicePriceMinor: row.priceMinorSnapshot };
}
