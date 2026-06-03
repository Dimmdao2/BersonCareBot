import { BookingCatalogPackagesSection } from "@/app/app/settings/BookingCatalogPackagesSection";
import { BookingCatalogProductsSection } from "@/app/app/settings/BookingCatalogProductsSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default function DoctorAdminBookingMembershipsPage() {
  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingCatalogPackagesSection apiBase="/api/doctor/booking-engine/packages" />
      <BookingCatalogProductsSection apiBase="/api/doctor/booking-engine/products" />
    </div>
  );
}
