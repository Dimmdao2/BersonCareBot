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
  const contactBreakdown = await deps.doctorClientsPort.getClientContactBreakdown({
    excludedUserIds: audience.excludedUserIds,
  });

  return (
    <DoctorAnalyticsShell
      initialTab={initialTab}
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
