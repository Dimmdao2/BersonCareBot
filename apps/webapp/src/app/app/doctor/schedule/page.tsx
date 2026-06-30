import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getDoctorEffectiveCalendarIana } from "@/modules/doctor-calendar-timezone/doctorCalendarTimezone";
import { pgDoctorCalendarTimezonePort } from "@/infra/repos/pgDoctorCalendarTimezone";
import { scheduleTabFromQuery } from "./doctorScheduleTabs";
import { DoctorScheduleShell } from "./DoctorScheduleShell";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);
  const initialTimeZone = await getDoctorEffectiveCalendarIana(
    session.user.userId,
    pgDoctorCalendarTimezonePort,
  ).catch(() => "Europe/Moscow");

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
      initialTimeZone={initialTimeZone}
    />
  );
}
