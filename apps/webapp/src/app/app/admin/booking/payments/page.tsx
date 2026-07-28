import { requireAdminDoctorPage } from '@/app/app/settings/requireAdminDoctorPage';

// Removed 2026-07-26: BookingPaymentsSection and BookingPrepaymentSection rendered here were
// tenant-scoped (a single organization's payment settings, via `getSetting(..., "admin")`) shown
// unconditionally to every global admin regardless of clinic membership — see owner report. Both
// sections remain reachable by the doctor/clinic_admin themselves on their own Schedule → Setup →
// «Оплаты» tab (ScheduleSetupTab.tsx SectionPayments). No platform-level content remains on this
// route; route removal/consolidation is a separate owner decision, not made here.
export default async function DoctorAdminBookingPaymentsPage() {
  await requireAdminDoctorPage();
  return null;
}
