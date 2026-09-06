import { DateTime } from 'luxon';
import { requirePlatformOperationsPage } from '@/app-layer/guards/requireRole';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { PlatformAnalyticsPageClient } from './PlatformAnalyticsPageClient';

export default async function PlatformAnalyticsPage() {
  const session = await requirePlatformOperationsPage();
  const displayIana = await getAppDisplayTimeZone();
  const calendarTodayYmd =
    DateTime.now().setZone(displayIana).toISODate() ??
    DateTime.now().toUTC().toISODate() ??
    '';
  return (
    <DoctorAppShell title="Аналитика платформы" user={session.user}>
      <DoctorPageHeader title="Аналитика" />
      <PlatformAnalyticsPageClient
        calendarTodayYmd={calendarTodayYmd}
        displayIana={displayIana}
      />
    </DoctorAppShell>
  );
}
