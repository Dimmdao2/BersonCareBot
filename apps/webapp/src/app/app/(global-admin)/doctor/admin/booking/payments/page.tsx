import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { parseBookingPaymentSettingsValue } from "@/modules/payments/bookingPaymentSettings";
import { BookingPaymentsSection } from "@/app/app/settings/BookingPaymentsSection";
import { BookingPrepaymentSection } from "@/app/app/settings/BookingPrepaymentSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export default async function DoctorAdminBookingPaymentsPage() {
  // The `(global-admin)/doctor/admin/booking` layout calls this same guard, but a layout's
  // `enterWithDbPlatformPrincipal` never reaches a sibling page's async context — the page then
  // reads with the BOOTSTRAP principal, which routes to the nonstaff pool and runs `RESET ROLE`,
  // i.e. as the bare login role (`bcb_*_runtime_nonstaff_login`) with no table grants at all. That
  // is the `permission denied for table app_runtime_settings` 500. Calling the guard HERE — exactly
  // as `(global-admin)/doctor/admin/app-settings/page.tsx` does — stamps the platform principal in
  // this component's own context, so the read runs as `app_platform_settings`, which already holds
  // the SELECT grant.
  await requireAdminDoctorPage();
  const deps = buildAppDeps();
  const paymentEnabledRow = await deps.systemSettings.getSetting("booking_payment_enabled", "admin");
  const paymentEnabled =
    paymentEnabledRow != null &&
    paymentEnabledRow.valueJson !== null &&
    typeof paymentEnabledRow.valueJson === "object" &&
    (paymentEnabledRow.valueJson as Record<string, unknown>).value === true;
  const providersRow = await deps.systemSettings.getSetting("booking_payment_providers", "admin");
  const providersJson = parseBookingPaymentSettingsValue(providersRow?.valueJson ?? null);

  return (
    <div className={BOOKING_CARD_GRID_CLASS}>
      <BookingPaymentsSection paymentEnabled={paymentEnabled} providersJson={providersJson} />
      <BookingPrepaymentSection />
    </div>
  );
}
