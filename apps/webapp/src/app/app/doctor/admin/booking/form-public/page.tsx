import { BookingSoloFormFieldsSection } from "@/app/app/settings/BookingSoloFormFieldsSection";
import { BookingPublicWidgetSection } from "@/app/app/settings/BookingPublicWidgetSection";
import { BookingPublicAttributionSection } from "@/app/app/settings/BookingPublicAttributionSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default function DoctorAdminBookingFormPublicPage() {
  return (
    <div className="space-y-4">
      <BookingSoloFormFieldsSection />
      <div className={BOOKING_CARD_GRID_CLASS}>
        <BookingPublicWidgetSection />
        <BookingPublicAttributionSection />
      </div>
    </div>
  );
}
