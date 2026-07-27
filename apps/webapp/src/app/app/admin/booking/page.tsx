import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadBookingAdminOverview } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BookingOverviewPanel } from "@/app/app/doctor/admin/booking/BookingOverviewPanel";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { PlatformLocationPaletteSection } from "./PlatformLocationPaletteSection";

export default async function DoctorAdminBookingOverviewPage() {
  await requireAdminDoctorPage();
  // A platform principal intentionally has no organization. Passing that absence through prevents
  // the booking loader from substituting the historical default clinic.
  const overview = await loadBookingAdminOverview(null);

  return (
    <div className="space-y-4">
      <BookingCatalogHelp />
      <BookingOverviewPanel data={overview} />

      <PlatformLocationPaletteSection />
    </div>
  );
}
