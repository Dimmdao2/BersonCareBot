import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  getMechanicSurfaceVisibility,
} from '@/app-layer/guards/requireEntitlement';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { getDoctorEffectiveCalendarIana } from '@/modules/doctor-calendar-timezone/doctorCalendarTimezone';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import { resolveActiveOwnSpecialistId } from '@/modules/doctor-schedule/scope';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { scheduleTabFromQuery, type ScheduleTabId } from './doctorScheduleTabs';
import { DoctorScheduleShell } from './DoctorScheduleShell';
import { loadDoctorScheduleCalendarBootstrap } from './loadDoctorScheduleCalendarBootstrap';
import { SCHEDULE_TAB_REGISTRY } from './scheduleTabRegistry';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

function deepLinkParamsForTab(
  tabId: ScheduleTabId,
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const entry = SCHEDULE_TAB_REGISTRY.find((item) => item.id === tabId);
  if (!entry) return {};
  const out: Record<string, string> = {};
  for (const key of entry.deepLinkKeys) {
    const val = firstParam(params[key]);
    if (val) out[key] = val;
  }
  return out;
}

export default async function DoctorSchedulePage({ searchParams }: Props) {
  const workspace = await requireOrganizationWorkspaceContext();
  const params = await searchParams;
  const deps = buildAppDeps();

  const initialTab = scheduleTabFromQuery(firstParam(params.tab) ?? null);

  const [
    paymentsVisibility,
    paymentsMutation,
    appDisplayTimeZone,
    doctorStatisticsVisibility,
  ] = await Promise.all([
    getMechanicSurfaceVisibility(workspace, 'payments'),
    getMechanicMutationAvailability(workspace, 'payments'),
    getAppDisplayTimeZone(),
    getMechanicSurfaceVisibility(workspace, 'doctor_statistics'),
  ]);

  const initialTimeZone = await getDoctorEffectiveCalendarIana(
    workspace.session.user.userId,
    deps.doctorCalendarTimezone,
  ).catch(() => appDisplayTimeZone);

  const directoryContext: DoctorWorkspaceContext = {
    organizationId: workspace.organizationId,
    organizationName: null,
    membershipId: workspace.membershipId,
    membershipRole: workspace.membershipRole,
    specialistId: workspace.specialistId,
    canManageOrganization: workspace.canManageOrganization,
    canManageAllSpecialists: workspace.canManageAllSpecialists,
    canAccessClinicalWorkspace: workspace.canAccessClinicalWorkspace,
    doctorScreensDisabled: workspace.doctorScreensDisabled,
    selectedSpecialistId: workspace.canManageAllSpecialists ? null : workspace.specialistId,
  };

  const directory = await deps.doctorWorkspace.listDirectory(directoryContext);
  const scheduleScopeBootstrap = {
    ownSpecialistId: resolveActiveOwnSpecialistId(workspace.specialistId, directory.specialists),
    canManageAllSpecialists: workspace.canManageAllSpecialists,
    specialists: directory.specialists.map((specialist) => ({
      id: specialist.id,
      displayLabel: specialist.fullName,
    })),
  };

  const doctorStatisticsEnabled = doctorStatisticsVisibility.specialistNavigation;

  let initialTabData: Partial<Record<ScheduleTabId, unknown>> | undefined;
  if (initialTab === 'cal') {
    const calBootstrap = await withDoctorWorkspacePrincipal(workspace, () =>
      loadDoctorScheduleCalendarBootstrap({
        deps,
        organizationId: workspace.organizationId,
        timeZone: initialTimeZone,
        scheduleScopeBootstrap,
        doctorStatisticsEnabled,
        deepLinkParams: deepLinkParamsForTab('cal', params),
      }),
    );
    if (calBootstrap) {
      initialTabData = { cal: calBootstrap };
    }
  }

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
      initialTimeZone={initialTimeZone}
      paymentsVisible={paymentsVisibility.specialistNavigation}
      paymentsReadOnly={!paymentsMutation.available}
      scheduleScopeBootstrap={scheduleScopeBootstrap}
      doctorStatisticsEnabled={doctorStatisticsEnabled}
      initialTabData={initialTabData}
    />
  );
}
