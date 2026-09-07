import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { COMMUNICATIONS_TABS, communicationsTabFromQuery } from './doctorCommunicationsTabs';
import { loadDoctorCommunicationsBadges } from './loadDoctorCommunicationsBadges';
import { loadDoctorExerciseCommentsForTab } from '../comments/loadDoctorExerciseCommentsForTab';
import { loadDoctorCommentPatients } from '../comments/loadDoctorCommentPatients';
import { DoctorCommunicationsShell } from './DoctorCommunicationsShell';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { requireWorkspaceModuleForPage } from '@/app-layer/guards/workspaceModuleAccess';
import { loadDoctorWorkspaceShell } from '../loadDoctorWorkspaceShell';

type Props = { searchParams: Promise<{ tab?: string; archive?: string }> };

export default async function DoctorCommunicationsPage({ searchParams }: Props) {
  const shell = await loadDoctorWorkspaceShell();
  const workspace = shell.workspaceAccess;
  const workspaceModules = shell.workspaceModules;
  const session = workspace.session;
  const params = await searchParams;
  const availableTabs = COMMUNICATIONS_TABS.filter((tab) => workspaceModules[tab.workspaceModule]);
  requireWorkspaceModuleForPage(availableTabs.length > 0);
  const initialTab = communicationsTabFromQuery(params.tab ?? null, availableTabs);

  const deps = buildAppDeps();

  const [mailingsMutationAvailable, badges, displayIana, commentsBundle] = await Promise.all([
    workspaceModules.mailings
      ? Promise.all([
          getMechanicMutationAvailability(workspace, 'mailings'),
          getMechanicMutationAvailability(workspace, 'branding'),
        ]).then(([mailings, branding]) => mailings.available && branding.available)
      : Promise.resolve(false),
    workspaceModules.direct_chat
      ? loadDoctorCommunicationsBadges(deps, {
          organizationId: workspace.organizationId,
          visibilityActor: workspace,
        })
      : Promise.resolve({}),
    getAppDisplayTimeZone(),
    initialTab === 'comments'
      ? (async () => {
          const audience = await loadDoctorAnalyticsAudience();
          const excludedUserIds = audience?.excludedUserIds ?? [];
          const [commentsData, patients] = await Promise.all([
            withDoctorWorkspacePrincipal(workspace, () =>
              loadDoctorExerciseCommentsForTab(deps, {
                viewerUserId: session.user.userId,
                organizationId: workspace.organizationId,
                excludedUserIds,
                visibilityActor: workspace,
              }),
            ),
            withDoctorWorkspacePrincipal(workspace, () =>
              loadDoctorCommentPatients(
                {
                  doctorClientsPort: deps.doctorClientsPort,
                  programItemDiscussion: deps.programItemDiscussion,
                },
                {
                  viewerUserId: session.user.userId,
                  organizationId: workspace.organizationId,
                  visibilityActor: workspace,
                },
                { excludedUserIds: excludedUserIds.length ? excludedUserIds : undefined },
              ),
            ),
          ]);
          const allowed = await withDoctorWorkspacePrincipal(workspace, () =>
            deps.doctorClients.filterPatientUserIdsByClientChannel(
              [
                ...commentsData.items.map((item) => item.patientUserId),
                ...patients.map((patient) => patient.patientUserId),
              ],
              { organizationId: workspace.organizationId },
              'commentsAllowed',
            ),
          );
          return {
            commentsData: {
              ...commentsData,
              items: commentsData.items.filter((item) => allowed.has(item.patientUserId)),
            },
            patients: patients.filter((patient) => allowed.has(patient.patientUserId)),
          };
        })()
      : Promise.resolve(null),
  ]);
  const commentsUnread =
    commentsBundle?.patients.reduce((sum, patient) => sum + patient.unreadCount, 0) ?? 0;

  return (
    <DoctorCommunicationsShell
      initialTab={initialTab}
      workspaceModules={workspaceModules}
      mailingsMutationAvailable={mailingsMutationAvailable}
      badges={commentsUnread > 0 ? { ...badges, comments: commentsUnread } : badges}
      displayIana={displayIana}
      initialTabData={
        commentsBundle
          ? {
              comments: {
                feed: commentsBundle.commentsData,
                patients: commentsBundle.patients,
                displayIana,
              },
            }
          : undefined
      }
    />
  );
}
