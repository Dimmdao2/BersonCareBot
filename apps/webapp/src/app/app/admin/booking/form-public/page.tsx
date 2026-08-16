import { redirect } from 'next/navigation';
import { BOOKING_ADMIN_BASE } from '@/app/app/doctor/admin/booking/bookingAdminTabs';

/** Removed tenant-scoped global-admin tab → platform booking overview. */
export default function DoctorAdminBookingFormPublicPage() {
  redirect(BOOKING_ADMIN_BASE);
}
