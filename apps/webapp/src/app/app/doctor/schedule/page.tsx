import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { scheduleTabFromQuery } from "./doctorScheduleTabs";
import { DoctorScheduleShell } from "./DoctorScheduleShell";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  await requireDoctorAccess();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
    />
  );
}
