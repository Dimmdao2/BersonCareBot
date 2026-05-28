/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { loadAdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import { loadAdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import { loadDoctorTodayDashboard } from "./loadDoctorTodayDashboard";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const intakeService = getOnlineIntakeService();
  const [data, kpiStats] = await Promise.all([
    loadDoctorTodayDashboard(
      {
        doctorAppointments: deps.doctorAppointments,
        doctorClients: deps.doctorClientsPort,
        messaging: deps.messaging,
      },
      intakeService,
    ),
    deps.doctorStats.getStats(),
  ]);
  const [adminHealthBanner, adminRegistrationFailureBanner] =
    session.user.role === "admin"
      ? await Promise.all([loadAdminDoctorTodayHealthBanner(), loadAdminRegistrationFailureAttention()])
      : [undefined, undefined];

  return (
    <AppShell title="Сегодня" user={session.user} variant="doctor">
      <DoctorTodayDashboard
        data={data}
        kpiStats={kpiStats}
        appointmentsTodayCount={data.todayAppointments.length}
        adminHealthBanner={adminHealthBanner}
        adminRegistrationFailureBanner={adminRegistrationFailureBanner}
        showAnalyticsLink={session.user.role === "admin"}
      />
    </AppShell>
  );
}
