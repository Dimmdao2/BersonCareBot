import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireOrganizationWorkspaceContext } from '@/app-layer/guards/requireRole';
import { getDoctorEffectiveCalendarIana } from '@/modules/doctor-calendar-timezone/doctorCalendarTimezone';
import { pgDoctorCalendarTimezonePort } from '@/infra/repos/pgDoctorCalendarTimezone';
import type { DoctorWorkspaceContext } from '@/modules/doctor-workspace/types';
import { resolveActiveOwnSpecialistId } from '@/modules/doctor-schedule/scope';
import {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  getAppDisplayTimeZone,
} from '@/modules/system-settings/appDisplayTimezone';
import { scheduleTabFromQuery } from './doctorScheduleTabs';
import { DoctorScheduleShell } from './DoctorScheduleShell';

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function DoctorSchedulePage({ searchParams }: Props) {
  const workspace = await requireOrganizationWorkspaceContext();
  const params = await searchParams;

  const initialTab = scheduleTabFromQuery(params.tab ?? null);
  const appDisplayTimeZone = await getAppDisplayTimeZone().catch(
    () => DEFAULT_APP_DISPLAY_TIMEZONE,
  );
  const initialTimeZone = await getDoctorEffectiveCalendarIana(
    workspace.session.user.userId,
    pgDoctorCalendarTimezonePort,
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
    selectedSpecialistId: workspace.canManageAllSpecialists ? null : workspace.specialistId,
  };
  const directory = await buildAppDeps().doctorWorkspace.listDirectory(directoryContext);
  const scheduleScopeBootstrap = {
    ownSpecialistId: resolveActiveOwnSpecialistId(
      workspace.specialistId,
      directory.specialists,
    ),
    canManageAllSpecialists: workspace.canManageAllSpecialists,
    specialists: directory.specialists.map((specialist) => ({
      id: specialist.id,
      displayLabel: specialist.fullName,
    })),
  };

  return (
    <DoctorScheduleShell
      initialTab={initialTab}
      initialTimeZone={initialTimeZone}
      scheduleScopeBootstrap={scheduleScopeBootstrap}
    />
  );
}
