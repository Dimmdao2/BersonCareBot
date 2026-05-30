import { BookingScheduleBlocksSection } from "@/app/app/settings/BookingScheduleBlocksSection";
import { BookingWorkingHoursSection } from "@/app/app/settings/BookingWorkingHoursSection";
import { BookingScheduleSlotsProbeSection } from "@/app/app/settings/BookingScheduleSlotsProbeSection";
import { BOOKING_CARD_GRID_WIDE_CLASS } from "@/shared/ui/doctorWorkspaceLayout";

export default function DoctorAdminBookingSchedulePage() {
  return (
    <div className="space-y-4">
      <div className={BOOKING_CARD_GRID_WIDE_CLASS}>
        <BookingWorkingHoursSection />
        <BookingScheduleBlocksSection />
      </div>
      <BookingScheduleSlotsProbeSection />
    </div>
  );
}
