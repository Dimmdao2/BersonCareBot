import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { scheduleTabFromQuery } from "./doctorScheduleTabs";
import { resolveSchedulePeriodPreset, loadDoctorScheduleKpis } from "./loadDoctorScheduleKpis";
import { DoctorScheduleShell } from "./DoctorScheduleShell";

type Props = {
  searchParams: Promise<{ tab?: string; period?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  await requireDoctorAccess();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);
  const initialPeriod = resolveSchedulePeriodPreset(params.period ?? null);

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();

  const initialKpis = await loadDoctorScheduleKpis(deps, initialPeriod, {
    excludedUserIds: audience?.excludedUserIds ?? [],
  });

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
      initialKpis={initialKpis}
      initialPeriod={initialPeriod}
    />
  );
}
