import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { BookingRulesPageClient } from "@/app/app/doctor/admin/booking/BookingRulesPageClient";

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

export default async function DoctorAdminBookingRulesPage() {
  const deps = buildAppDeps();
  const row = await deps.systemSettings.getSetting(
    "booking_allow_doctor_unlink_past_package_sessions",
    "admin",
  );
  const allowPastUnlink = parseAdminBoolean(row?.valueJson ?? null);

  return <BookingRulesPageClient allowPastUnlinkPastPackageSessions={allowPastUnlink} />;
}
