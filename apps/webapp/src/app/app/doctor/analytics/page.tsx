/**
 * Аналитика — одна страница, четыре вкладки (Клиенты · Контент · Приложение · Уведомления).
 * `/app/doctor/analytics` (?tab=clients|content|app|notifications).
 *
 * Серверная часть готовит только SSR-срез вкладки «Клиенты» (список клиентов не
 * зависит от периода тулбара); остальные вкладки самозагружаются на клиенте.
 */
import { DateTime } from "luxon";

import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

import { DoctorAnalyticsShell } from "./DoctorAnalyticsShell";
import { analyticsTabFromQuery } from "./doctorAnalyticsTabs";

function getValueJson<T>(v: unknown, fallback: T): T {
  if (v !== null && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value as T;
  }
  return fallback;
}

function resolvePatientLabels(singular: string) {
  const isKlient = singular === "клиент";
  return {
    patientPluralLabel: isKlient ? "Клиенты" : "Пациенты",
    patientGenPlural: isKlient ? "клиентов" : "пациентов",
  };
}

type Props = {
  searchParams: Promise<{ tab?: string | string[] }>;
};

export default async function DoctorAnalyticsPage({ searchParams }: Props) {
  await requireAdminDoctorPage();
  const sp = await searchParams;
  const rawTab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = analyticsTabFromQuery(rawTab);

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
  const { patientPluralLabel, patientGenPlural } = resolvePatientLabels(String(patientSingular));

  return (
    <DoctorAnalyticsShell
      initialTab={initialTab}
      patientPluralLabel={patientPluralLabel}
      patientGenPlural={patientGenPlural}
      clientsData={{
        calendarTodayYmd,
        displayIana,
        clients: {
          total: contactBreakdown.total,
          phoneOnly: contactBreakdown.phoneOnly,
          appGuests: contactBreakdown.appGuests,
          patientsCount: contactBreakdown.patientsCount,
          subscribersOnlyCount: contactBreakdown.subscribersOnlyCount,
          contactBreakdown,
        },
      }}
    />
  );
}
