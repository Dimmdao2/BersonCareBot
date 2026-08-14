/**
 * Главная страница кабинета специалиста («/app/doctor») — экран «Сегодня».
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
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
import { doctorSectionCardClass } from '@/shared/ui/doctor/doctorVisual';
import { cn } from '@/lib/utils';
import { DoctorTodayAdminBannersSuspense } from './DoctorTodayAdminBanners';
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

function DoctorTodayDashboardFallback() {
  return (
    <div className={cn(doctorSectionCardClass, 'gap-3')} aria-busy="true">
      <div className="h-5 w-32 animate-pulse rounded-md bg-muted" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-lg bg-muted/70" />
        <div className="h-40 animate-pulse rounded-lg bg-muted/70" />
      </div>
      <span className="sr-only">Загрузка…</span>
    </div>
  );
}

async function DoctorTodayDashboardSection({
  workspace,
}: {
  workspace: Awaited<ReturnType<typeof requireOrganizationWorkspaceContext>>;
}) {
  const session = workspace.session;
  const deps = buildAppDeps();

  const [displayIana, audience, todayPreferencesRow, specialistTasksAvailability, specialistTasksRead] =
    await Promise.all([
      getAppDisplayTimeZone(),
      loadDoctorAnalyticsAudience(),
      deps.systemSettings.getSetting(DOCTOR_TODAY_PREFERENCES_KEY, 'doctor', {
        organizationId: workspace.organizationId,
      }),
      getMechanicMutationAvailability(workspace, 'specialist_tasks'),
      requireEntitlementForReadAction(workspace, 'specialist_tasks'),
    ]);

  const todayPreferences = parseDoctorTodayPreferences(todayPreferencesRow?.valueJson);
  const specialistTasksAvailable = specialistTasksAvailability.available;
  const specialistTasksReadable = specialistTasksRead.ok;
  const workspaceAudience = {
    includeTestAccounts: audience.includeTestAccounts,
    excludedUserIds: audience.excludedUserIds,
    organizationId: workspace.organizationId,
  };

  const [data, todayWorkingBounds] = await Promise.all([
    withDoctorWorkspacePrincipal(workspace, () =>
      loadDoctorTodayDashboard(
        {
          doctorAppointments: deps.doctorAppointments,
          doctorClients: deps.doctorClientsPort,
          messaging: deps.messaging,
          specialistTasks: specialistTasksReadable ? deps.specialistTasks : undefined,
          specialistOwnerUserId: specialistTasksReadable ? session.user.userId : undefined,
          doctorUserId: session.user.userId,
          organizationId: workspace.organizationId,
          visibilityActor: workspace,
          treatmentProgramProgress: deps.treatmentProgramProgress,
          treatmentProgramInstance: deps.treatmentProgramInstance,
          programItemDiscussion: deps.programItemDiscussion,
          programActionLog: deps.programActionLog,
          displayIana,
        },
        workspaceAudience,
        todayPreferences,
      ),
    ),
    loadTodayWorkingBounds(deps, displayIana, workspace.organizationId),
  ]);

  return (
    <DoctorTodayDashboard
      data={data}
      displayIana={displayIana}
      todayWorkingBounds={todayWorkingBounds}
      specialistTasksAvailable={specialistTasksAvailable}
      specialistTasksReadable={specialistTasksReadable}
    />
  );
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

  return (
    <DoctorAppShell title="Сегодня" user={session.user}>
      <div className="flex flex-col gap-3">
        {session.user.role === 'admin' ? <DoctorTodayAdminBannersSuspense /> : null}
        <Suspense fallback={<DoctorTodayDashboardFallback />}>
          <DoctorTodayDashboardSection workspace={workspace} />
        </Suspense>
      </div>
    </DoctorAppShell>
  );
}
