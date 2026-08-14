import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { getMechanicMutationAvailability } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { communicationsTabFromQuery } from './doctorCommunicationsTabs';
import { loadDoctorCommunicationsBadges } from './loadDoctorCommunicationsBadges';
import { loadDoctorExerciseCommentsForTab } from '../comments/loadDoctorExerciseCommentsForTab';
import { loadDoctorCommentPatients } from '../comments/loadDoctorCommentPatients';
import { DoctorCommunicationsShell } from './DoctorCommunicationsShell';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';

type Props = { searchParams: Promise<{ tab?: string; archive?: string }> };

export default async function DoctorCommunicationsPage({ searchParams }: Props) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const params = await searchParams;
  const initialTab = communicationsTabFromQuery(params.tab ?? null);
  const mailingsMutationAvailability = await getMechanicMutationAvailability(workspace, 'mailings');

  const deps = buildAppDeps();

  const [badges, displayIana] = await Promise.all([
    loadDoctorCommunicationsBadges(deps, {
      organizationId: workspace.organizationId,
      visibilityActor: workspace,
    }),
    getAppDisplayTimeZone(),
  ]);

  let commentsData: Awaited<ReturnType<typeof loadDoctorExerciseCommentsForTab>> | null = null;
  let patients: Awaited<ReturnType<typeof loadDoctorCommentPatients>> | null = null;

  if (initialTab === 'comments') {
    const audience = await loadDoctorAnalyticsAudience();
    const excludedUserIds = audience?.excludedUserIds ?? [];

    [commentsData, patients] = await Promise.all([
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
  }

  return (
    <DoctorCommunicationsShell
      initialTab={initialTab}
      mailingsMutationAvailable={mailingsMutationAvailability.available}
      badges={badges}
      displayIana={displayIana}
      initialTabData={
        initialTab === 'comments' && commentsData
          ? {
              comments: {
                feed: commentsData,
                patients,
                displayIana,
              },
            }
          : undefined
      }
    />
  );
}
