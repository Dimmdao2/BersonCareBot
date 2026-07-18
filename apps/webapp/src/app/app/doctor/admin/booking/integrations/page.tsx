import { redirect } from "next/navigation";
import { BOOKING_ADMIN_BASE } from "@/app/app/doctor/admin/booking/bookingAdminTabs";

/** Retired normal Rubitime settings route → canonical booking settings landing. */
export default function DoctorAdminBookingIntegrationsPage() {
  redirect(BOOKING_ADMIN_BASE);
}
