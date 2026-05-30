import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";

export default function DoctorAdminBookingCatalogPage() {
  return (
    <div className="space-y-4">
      <BookingCatalogHelp />
      <BookingEngineSection mode="catalog" />
    </div>
  );
}
