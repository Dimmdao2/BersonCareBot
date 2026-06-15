import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { scheduleTabFromQuery } from "./doctorScheduleTabs";
import { DoctorScheduleShell } from "./DoctorScheduleShell";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  await requireDoctorAccess();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);
  const initialTimeZone = await getAppDisplayTimeZone().catch(() => "Europe/Moscow");

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
      initialTimeZone={initialTimeZone}
    />
  );
}
