import { loadBookingAdminOverview } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BookingOverviewPanel } from "@/app/app/doctor/admin/booking/BookingOverviewPanel";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";

export default async function DoctorAdminBookingOverviewPage() {
  const overview = await loadBookingAdminOverview();

  return (
    <div className="space-y-4">
      <BookingCatalogHelp />
      <BookingOverviewPanel data={overview} />
    </div>
  );
}
