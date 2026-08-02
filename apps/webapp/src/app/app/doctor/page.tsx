/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import Link from 'next/link';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { getOnlineIntakeService } from '@/app-layer/di/onlineIntakeDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { loadAdminRegistrationFailureAttention } from '@/app-layer/product-analytics/loadAdminRegistrationFailureAttention';
import { loadAdminDoctorTodayHealthBanner } from '@/modules/operator-health/adminDoctorTodayHealthBanner';
import { deriveWorkingBounds, pickWorkingHours } from '@/modules/booking-scheduling/computeSlots';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import {
  DOCTOR_TODAY_PREFERENCES_KEY,
  parseDoctorTodayPreferences,
} from '@/modules/system-settings/doctorTodayPreferences';
import { DateTime } from 'luxon';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import {
  DoctorSection,
  DoctorSectionHeader,
  DoctorSectionTitle,
} from '@/shared/ui/doctor/DoctorSection';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button-variants';
import { DoctorTodayDashboard } from './DoctorTodayDashboard';
import { loadDoctorTodayDashboard } from './loadDoctorTodayDashboard';

/**
 * §1.2 (S4): Вычисляет рабочие границы текущего дня через scheduling-порт.
 * Вызывается в RSC, т.к. scheduling — сервер-side dep (clean-arch: БД через порт).
 * Возвращает `null` если scheduling недоступен или день закрыт.
 */
async function loadTodayWorkingBounds(
  deps: ReturnType<typeof buildAppDeps>,
  displayIana: string,
  organizationId: string,
): Promise<{ startMinute: number; endMinute: number } | null> {
  const scheduling = deps.bookingScheduling;
  if (!scheduling) return null;

  try {
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
  const workspace = await requireOrganizationWorkspaceContext();
  const session = workspace.session;
  if (!workspace.canAccessClinicalWorkspace) {
    return (
      <DoctorAppShell title="Первый запуск" user={session.user}>
        <DoctorSection>
          <DoctorSectionHeader>
            <DoctorSectionTitle>Защитите аккаунт</DoctorSectionTitle>
          </DoctorSectionHeader>
          <p className="text-sm text-muted-foreground">
            Кабинет создан. Чтобы открыть пациентов и клинические данные, подключите двухфакторную
            защиту и сохраните резервные коды.
          </p>
          <Link className={buttonVariants({ size: 'sm' })} href="/app/account?tab=security">
            Настроить двухфакторную защиту
          </Link>
        </DoctorSection>
      </DoctorAppShell>
    );
  }
  const deps = buildAppDeps();
  const intakeService = getOnlineIntakeService();
  const displayIana = await getAppDisplayTimeZone();
  const audience = await loadDoctorAnalyticsAudience();
  const todayPreferencesRow = await deps.systemSettings.getSetting(
    DOCTOR_TODAY_PREFERENCES_KEY,
    'doctor',
    { organizationId: workspace.organizationId },
  );
  const todayPreferences = parseDoctorTodayPreferences(todayPreferencesRow?.valueJson);
  const [specialistTasksAvailability, specialistTasksRead] = await Promise.all([
    getMechanicMutationAvailability(workspace, 'specialist_tasks'),
    requireEntitlementForReadAction(workspace, 'specialist_tasks'),
  ]);
  const specialistTasksAvailable = specialistTasksAvailability.available;
  const specialistTasksReadable = specialistTasksRead.ok;
  const workspaceAudience = {
    includeTestAccounts: audience.includeTestAccounts,
    excludedUserIds: audience.excludedUserIds,
    organizationId: workspace.organizationId,
  };
  const [data, kpiStats, dashboardMetrics, todayWorkingBounds] = await Promise.all([
    withDoctorWorkspacePrincipal(workspace, () =>
      loadDoctorTodayDashboard(
        {
          doctorAppointments: deps.doctorAppointments,
          doctorClients: deps.doctorClientsPort,
          messaging: deps.messaging,
          specialistTasks: deps.specialistTasks,
          specialistOwnerUserId: session.user.userId,
          doctorUserId: session.user.userId,
          organizationId: workspace.organizationId,
          treatmentProgramProgress: deps.treatmentProgramProgress,
          doctorProactiveInsights: deps.doctorProactiveInsights,
          treatmentProgramInstance: deps.treatmentProgramInstance,
          programItemDiscussion: deps.programItemDiscussion,
          programActionLog: deps.programActionLog,
          displayIana,
          loadMonthAppointments: () =>
            deps.doctorAppointments.listAppointmentsForSpecialist(
              { kind: 'recordsInCalendarMonth' },
              workspaceAudience,
            ),
        },
        intakeService,
        workspaceAudience,
        todayPreferences,
      ),
    ),
    deps.doctorStats.getStats(workspaceAudience),
    deps.doctorAppointments.getDashboardAppointmentMetrics({
      excludedUserIds: audience.excludedUserIds,
      organizationId: workspace.organizationId,
    }),
    // §1.2: рабочие границы сегодняшнего дня для мини-календаря
    loadTodayWorkingBounds(deps, displayIana, workspace.organizationId),
  ]);
  const [adminHealthBanner, adminRegistrationFailureBanner] =
    session.user.role === 'admin'
      ? await Promise.all([
          loadAdminDoctorTodayHealthBanner(),
          loadAdminRegistrationFailureAttention(),
        ])
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
        specialistTasksAvailable={specialistTasksAvailable}
        specialistTasksReadable={specialistTasksReadable}
      />
    </DoctorAppShell>
  );
}
