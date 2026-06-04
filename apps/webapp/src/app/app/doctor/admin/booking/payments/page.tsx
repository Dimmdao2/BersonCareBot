import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { parseBookingPaymentSettingsValue } from "@/modules/payments/bookingPaymentSettings";
import { BookingPaymentsSection } from "@/app/app/settings/BookingPaymentsSection";
import { BookingPrepaymentSection } from "@/app/app/settings/BookingPrepaymentSection";
import { BOOKING_CARD_GRID_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";

export default async function DoctorAdminBookingPaymentsPage() {
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
