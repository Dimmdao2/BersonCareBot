import { BookingEngineSection } from "@/app/app/settings/BookingEngineSection";
import { RubitimeSection } from "@/app/app/settings/RubitimeSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default function DoctorAdminBookingIntegrationsPage() {
  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingEngineSection mode="integrations" />
      <RubitimeSection />
    </div>
  );
}
