import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { loadBookingAdminOverview } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BookingOverviewPanel } from "@/app/app/doctor/admin/booking/BookingOverviewPanel";
import { BookingRulesPageClient } from "@/app/app/doctor/admin/booking/BookingRulesPageClient";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingSoloLocationsSection } from "@/app/app/settings/BookingSoloLocationsSection";
import { BookingSoloServicesSection } from "@/app/app/settings/BookingSoloServicesSection";
import { BookingSoloAvailabilitySection } from "@/app/app/settings/BookingSoloAvailabilitySection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

function parseAdminBoolean(valueJson: unknown): boolean {
  if (valueJson === true) return true;
  if (
    valueJson &&
    typeof valueJson === "object" &&
    "value" in valueJson &&
    (valueJson as { value?: unknown }).value === true
  ) {
    return true;
  }
  return false;
}

export default async function DoctorAdminBookingOverviewPage() {
  const deps = buildAppDeps();
  const [overview, settingRow] = await Promise.all([
    loadBookingAdminOverview(),
    deps.systemSettings.getSetting("booking_allow_doctor_unlink_past_package_sessions", "admin"),
  ]);
  const allowPastUnlink = parseAdminBoolean(settingRow?.valueJson ?? null);

  return (
    <div className="space-y-4">
      <BookingCatalogHelp />
      <BookingOverviewPanel data={overview} />

      <section id="section-locations">
        <BookingSoloLocationsSection />
      </section>

      <div className={BOOKING_CARD_GRID_CLASS}>
        <section id="section-services">
          <BookingSoloServicesSection />
        </section>
        <section id="section-availability">
          <BookingSoloAvailabilitySection />
        </section>
      </div>

      <section id="section-rules">
        <BookingRulesPageClient allowPastUnlinkPastPackageSessions={allowPastUnlink} />
      </section>
    </div>
  );
}
