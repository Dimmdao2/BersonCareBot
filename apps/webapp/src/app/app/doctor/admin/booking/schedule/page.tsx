import { BookingScheduleBlocksSection } from "@/app/app/settings/BookingScheduleBlocksSection";
import { BookingScheduleSlotsProbeSection } from "@/app/app/settings/BookingScheduleSlotsProbeSection";
import { BookingSoloScheduleSection } from "@/app/app/settings/BookingSoloScheduleSection";

export default function DoctorAdminBookingSchedulePage() {
  return (
    <div className="space-y-4">
      <BookingSoloScheduleSection />
      <BookingScheduleBlocksSection soloUx />
      <BookingScheduleSlotsProbeSection />
    </div>
  );
}
