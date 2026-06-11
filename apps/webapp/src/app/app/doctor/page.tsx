/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { loadAdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import { loadAdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import { loadDoctorTodayDashboard } from "./loadDoctorTodayDashboard";

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const intakeService = getOnlineIntakeService();
  const displayIana = await getAppDisplayTimeZone();
  const audience = await loadDoctorAnalyticsAudience();
  const [data, kpiStats, todayAppointmentStats, dashboardMetrics] = await Promise.all([
    loadDoctorTodayDashboard(
      {
        doctorAppointments: deps.doctorAppointments,
        doctorClients: deps.doctorClientsPort,
        messaging: deps.messaging,
        specialistTasks: deps.specialistTasks,
        specialistOwnerUserId: session.user.userId,
        doctorUserId: session.user.userId,
        treatmentProgramProgress: deps.treatmentProgramProgress,
        doctorProactiveInsights: deps.doctorProactiveInsights,
        treatmentProgramInstance: deps.treatmentProgramInstance,
        programItemDiscussion: deps.programItemDiscussion,
        programActionLog: deps.programActionLog,
        displayIana,
      },
      intakeService,
      audience,
    ),
    deps.doctorStats.getStats(audience),
    deps.doctorAppointments.getAppointmentStats({ kind: "range", range: "today" }, audience),
    deps.doctorAppointments.getDashboardAppointmentMetrics(
      audience?.excludedUserIds?.length ? { excludedUserIds: audience.excludedUserIds } : undefined,
    ),
  ]);
  const [adminHealthBanner, adminRegistrationFailureBanner] =
    session.user.role === "admin"
      ? await Promise.all([loadAdminDoctorTodayHealthBanner(), loadAdminRegistrationFailureAttention()])
      : [undefined, undefined];

  return (
    <DoctorAppShell title="Сегодня" user={session.user}>
      <DoctorTodayDashboard
        data={data}
        kpiStats={kpiStats}
        appointmentsTodayCount={todayAppointmentStats.total}
        monthAppointmentCount={dashboardMetrics.recordsInCalendarMonthTotal}
        displayIana={displayIana}
        adminHealthBanner={adminHealthBanner}
        adminRegistrationFailureBanner={adminRegistrationFailureBanner}
        showAnalyticsLink={session.user.role === "admin"}
      />
    </DoctorAppShell>
  );
}
