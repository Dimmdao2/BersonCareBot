import { requireDoctorAccess } from '@/app-layer/guards/requireRole';
import { getDoctorEffectiveCalendarIana } from '@/modules/doctor-calendar-timezone/doctorCalendarTimezone';
import { pgDoctorCalendarTimezonePort } from '@/infra/repos/pgDoctorCalendarTimezone';
import {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  getAppDisplayTimeZone,
} from '@/modules/system-settings/appDisplayTimezone';
import { scheduleTabFromQuery } from './doctorScheduleTabs';
import { DoctorScheduleShell } from './DoctorScheduleShell';

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);
  const appDisplayTimeZone = await getAppDisplayTimeZone().catch(
    () => DEFAULT_APP_DISPLAY_TIMEZONE,
  );
  const initialTimeZone = await getDoctorEffectiveCalendarIana(
    session.user.userId,
    pgDoctorCalendarTimezonePort,
  ).catch(() => appDisplayTimeZone);

  return <DoctorScheduleShell initialTab={initialTab} initialTimeZone={initialTimeZone} />;
}
