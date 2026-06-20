/**
 * Аналитика по клиентам (/app/doctor/analytics/clients).
 */
import { DateTime } from "luxon";
import { redirect } from "next/navigation";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { resolvePatientTerms } from "@/modules/system-settings/patientTerms";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";

import { DoctorAnalyticsClientsPageClient } from "./DoctorAnalyticsClientsPageClient";

function getValueJson<T>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value as T;
  }
  return fallback;
}

export default async function DoctorAnalyticsClientsPage() {
  const session = await requireDoctorAccess();
  if (session.user.role !== "admin") {
    redirect("/app/doctor");
  }
  const deps = buildAppDeps();
  const displayIana = await getAppDisplayTimeZone();
  const calendarTodayYmd = DateTime.now().setZone(displayIana).toFormat("yyyy-LL-dd");
  const audience = await loadDoctorAnalyticsAudience();

  const [doctorSettings, contactBreakdown] = await Promise.all([
    deps.systemSettings.listSettingsByScope("doctor"),
    deps.doctorClientsPort.getClientContactBreakdown({ excludedUserIds: audience.excludedUserIds }),
  ]);

  const patientSingular = getValueJson(
    doctorSettings.find((x) => x.key === "patient_label")?.valueJson,
    "пациент",
  );
  const { patientPluralLabel, patientGenPlural } = resolvePatientTerms(String(patientSingular));

  return (
    <DoctorAppShell title={patientPluralLabel} user={session.user}>
      <DoctorAnalyticsClientsPageClient
        calendarTodayYmd={calendarTodayYmd}
        displayIana={displayIana}
        patientPluralLabel={patientPluralLabel}
        patientGenPlural={patientGenPlural}
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
