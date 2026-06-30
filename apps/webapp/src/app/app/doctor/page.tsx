/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { loadAdminRegistrationFailureAttention } from "@/app-layer/product-analytics/loadAdminRegistrationFailureAttention";
import { loadAdminDoctorTodayHealthBanner } from "@/modules/operator-health/adminDoctorTodayHealthBanner";
import {
  deriveWorkingBounds,
  pickWorkingHours,
} from "@/modules/booking-scheduling/computeSlots";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { DateTime } from "luxon";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorTodayDashboard } from "./DoctorTodayDashboard";
import { loadDoctorTodayDashboard } from "./loadDoctorTodayDashboard";

/**
 * §1.2 (S4): Вычисляет рабочие границы текущего дня через scheduling-порт.
 * Вызывается в RSC, т.к. scheduling — сервер-side dep (clean-arch: БД через порт).
 * Возвращает `null` если scheduling недоступен или день закрыт.
 */
async function loadTodayWorkingBounds(
  deps: ReturnType<typeof buildAppDeps>,
  displayIana: string,
): Promise<{ startMinute: number; endMinute: number } | null> {
  const scheduling = deps.bookingScheduling;
  const bookingEngine = deps.bookingEngine;
  if (!scheduling || !bookingEngine) return null;

  try {
    const organizationId = await bookingEngine.organization.getDefaultOrganizationId();
    const todayKey = DateTime.now().setZone(displayIana).toISODate();
    if (!todayKey) return null;

    const [workingHoursRowsRaw, perDayRows] = await Promise.all([
      // listWorkingHoursAdmin returns all (active+inactive); filter to isActive=true to match port behaviour
      scheduling.listWorkingHoursAdmin({
        organizationId,
        specialistId: null,
        branchId: null,
        roomId: null,
      }),
      scheduling.listWorkingDays({
        organizationId,
        specialistId: null,
        dateFrom: todayKey,
        dateTo: todayKey,
      }),
    ]);

    const workingHoursRows = workingHoursRowsRaw.filter((r) => r.isActive);
    const effectiveRows = pickWorkingHours(workingHoursRows);
    const perDayRecord = perDayRows.find((r: { workDate: string }) => r.workDate === todayKey);
    const perDayRow = perDayRecord
      ? {
          workDate: perDayRecord.workDate,
          startMinute: perDayRecord.startMinute,
          endMinute: perDayRecord.endMinute,
          breaks: perDayRecord.breaks,
          isClosed: perDayRecord.isClosed,
        }
      : undefined;

    return deriveWorkingBounds(todayKey, displayIana, effectiveRows, perDayRow);
  } catch {
    // Не блокируем страницу если scheduling недоступен
    return null;
  }
}

export default async function DoctorPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const intakeService = getOnlineIntakeService();
  const displayIana = await getAppDisplayTimeZone();
  const audience = await loadDoctorAnalyticsAudience();
  const [data, kpiStats, dashboardMetrics, todayWorkingBounds] = await Promise.all([
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
        loadMonthAppointments: () =>
          deps.doctorAppointments.listAppointmentsForSpecialist({ kind: "recordsInCalendarMonth" }),
      },
      intakeService,
      audience,
    ),
    deps.doctorStats.getStats(audience),
    deps.doctorAppointments.getDashboardAppointmentMetrics(
      audience?.excludedUserIds?.length ? { excludedUserIds: audience.excludedUserIds } : undefined,
    ),
    // §1.2: рабочие границы сегодняшнего дня для мини-календаря
    loadTodayWorkingBounds(deps, displayIana),
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
        // #9: count == modal list count. lists now include cancelled (statsRange).
        // Derive counts directly from the list so card and modal always agree.
        appointmentsTodayCount={data.todayAppointments.length}
        weekAppointmentsCount={data.weekAppointments.length}
        monthAppointmentCount={dashboardMetrics.recordsInCalendarMonthTotal}
        displayIana={displayIana}
        adminHealthBanner={adminHealthBanner}
        adminRegistrationFailureBanner={adminRegistrationFailureBanner}
        todayWorkingBounds={todayWorkingBounds}
      />
    </DoctorAppShell>
  );
}
