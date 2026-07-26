import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { loadBookingAdminOverview } from "@/app/app/doctor/admin/booking/loadBookingAdminOverview";
import { BookingOverviewPanel } from "@/app/app/doctor/admin/booking/BookingOverviewPanel";
import { BookingRulesPageClient } from "@/app/app/doctor/admin/booking/BookingRulesPageClient";
import { BookingCatalogHelp } from "@/app/app/settings/BookingCatalogHelp";
import { BookingSoloLocationsSection } from "@/app/app/settings/BookingSoloLocationsSection";
import { BookingSoloServicesSection } from "@/app/app/settings/BookingSoloServicesSection";
import { BookingSoloAvailabilitySection } from "@/app/app/settings/BookingSoloAvailabilitySection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { PlatformLocationPaletteSection } from "./PlatformLocationPaletteSection";

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
  // Same bug, same shape, same fix as the sibling `booking/payments/page.tsx` in 19f52fed2: both
  // this page's `layout.tsx` and the `(global-admin)/doctor/layout.tsx` above it already call a
  // platform guard, but a layout's `enterWithDbPlatformPrincipal` never reaches a sibling page's
  // async context — Next renders them in separate continuations. Without this line the reads below
  // run under the BOOTSTRAP principal, which `choosePoolKindForPrincipal` routes to the nonstaff
  // pool and `applySignedDbPrincipal` answers with `release_principal_context()` + `RESET ROLE`,
  // i.e. as the bare `bcb_*_nonstaff_login` that holds no grant on `system_settings` or on the
  // booking-engine tables `loadBookingAdminOverview()` reads. Calling the guard HERE stamps the
  // platform principal in this component's own context, so both reads run as
  // `app_platform_settings`, which already holds them. No new GRANT: granting the patient-pool
  // login role these tables would destroy the wall the dual-pool design exists to hold.
  await requireAdminDoctorPage();
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

      <PlatformLocationPaletteSection />

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
