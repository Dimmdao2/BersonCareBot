import { redirect } from "next/navigation";
import { BOOKING_ADMIN_BASE } from "@/app/app/doctor/admin/booking/bookingAdminTabs";

/** Legacy `/catalog` → overview. */
export default function DoctorAdminBookingCatalogRedirectPage() {
  redirect(BOOKING_ADMIN_BASE);
}
