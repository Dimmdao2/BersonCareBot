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
import { DoctorTodayDashboard, type DoctorTodayCalendarSnapshot } from './DoctorTodayDashboard';
import { DoctorTodayQuickActions } from './DoctorTodayQuickActions';
import { loadDoctorTodayDashboard } from './loadDoctorTodayDashboard';

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
  displayIana,
}: {
  workspace: Awaited<ReturnType<typeof requireOrganizationWorkspaceContext>>;
  displayIana: string;
}) {
  const session = workspace.session;
  const deps = buildAppDeps();

  const [
    audience,
    todayPreferencesRow,
    specialistTasksAvailability,
    specialistTasksRead,
  ] = await Promise.all([
    loadDoctorAnalyticsAudience(),
    deps.systemSettings.getSetting(DOCTOR_TODAY_PREFERENCES_KEY, 'doctor', {
      organizationId: workspace.organizationId,
    }),
    getMechanicMutationAvailability(workspace, 'specialist_tasks'),
    requireEntitlementForReadAction(workspace, 'specialist_tasks'),
  ]);

  const todayPreferences = parseDoctorTodayPreferences(todayPreferencesRow?.valueJson);
  const snapshotDateTime = DateTime.now().setZone(displayIana);
  const calendarSnapshot: DoctorTodayCalendarSnapshot = {
    todayIso: snapshotDateTime.toISODate() ?? new Date().toISOString().slice(0, 10),
    nowMinutes: snapshotDateTime.hour * 60 + snapshotDateTime.minute,
    todayDateLabel: snapshotDateTime.setLocale('ru').toFormat('EEE, d MMMM'),
  };
  const specialistTasksAvailable = specialistTasksAvailability.available;
  const specialistTasksReadable = specialistTasksRead.ok;
  const workspaceAudience = {
    includeTestAccounts: audience.includeTestAccounts,
    excludedUserIds: audience.excludedUserIds,
    organizationId: workspace.organizationId,
  };

  const data = await withDoctorWorkspacePrincipal(workspace, () =>
    loadDoctorTodayDashboard(
      {
        doctorAppointments: deps.doctorAppointments,
        bookingCalendar: deps.bookingCalendar ?? undefined,
        clientHistory: deps.clientHistory,
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
  );

  return (
    <DoctorTodayDashboard
      data={data}
      displayIana={displayIana}
      calendarSnapshot={calendarSnapshot}
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

  const displayIana = await getAppDisplayTimeZone();
  const todayIso =
    DateTime.now().setZone(displayIana).toISODate() ?? new Date().toISOString().slice(0, 10);

  return (
    <DoctorAppShell
      title="Сегодня"
      user={session.user}
      layout="full-height"
      mobileBottomGutter
      mobileHeaderActions={
        <DoctorTodayQuickActions
          todayIso={todayIso}
          displayIana={displayIana}
          placement="mobile-header"
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {session.user.role === 'admin' ? <DoctorTodayAdminBannersSuspense /> : null}
        <Suspense fallback={<DoctorTodayDashboardFallback />}>
          <DoctorTodayDashboardSection workspace={workspace} displayIana={displayIana} />
        </Suspense>
      </div>
    </DoctorAppShell>
  );
}
