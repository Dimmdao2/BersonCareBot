/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import { loadDoctorTodayDashboard } from "./loadDoctorTodayDashboard";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const intakeService = getOnlineIntakeService();
  const data = await loadDoctorTodayDashboard(deps, intakeService);

  return (
    <AppShell title="Сегодня" user={session.user} variant="doctor">
      <DoctorTodayDashboard data={data} />
    </AppShell>
  );
}
