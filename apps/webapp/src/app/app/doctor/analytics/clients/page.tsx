/**
 * Аналитика по клиентам (/app/doctor/analytics/clients).
 */
import { DateTime } from "luxon";
import { redirect } from "next/navigation";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";

import { DoctorAnalyticsClientsPageClient } from "./DoctorAnalyticsClientsPageClient";

export default async function DoctorAnalyticsClientsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }
  const deps = buildAppDeps();
  const displayIana = await getAppDisplayTimeZone();
  const calendarTodayYmd = DateTime.now().setZone(displayIana).toFormat("yyyy-LL-dd");
  const audience = await loadDoctorAnalyticsAudience();
  const contactBreakdown = await deps.doctorClientsPort.getClientContactBreakdown({
    excludedUserIds: audience.excludedUserIds,
  });

  return (
    <DoctorAppShell title="По клиентам" user={session.user}>
      <DoctorAnalyticsClientsPageClient
        calendarTodayYmd={calendarTodayYmd}
        displayIana={displayIana}
        clients={{
          total: contactBreakdown.total,
          phoneOnly: contactBreakdown.phoneOnly,
          appGuests: contactBreakdown.appGuests,
          patientsCount: contactBreakdown.patientsCount,
          subscribersOnlyCount: contactBreakdown.subscribersOnlyCount,
          contactBreakdown,
        }}
      />
    </DoctorAppShell>
  );
}
