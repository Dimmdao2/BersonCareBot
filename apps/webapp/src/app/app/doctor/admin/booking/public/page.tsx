import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default function DoctorAdminBookingPublicPage() {
  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingPublicWidgetSection />
      <BookingPublicAttributionSection />
    </div>
  );
}
