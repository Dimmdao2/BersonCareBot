import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { communicationsTabFromQuery } from "./doctorCommunicationsTabs";
import { loadDoctorCommunicationsBadges } from "./loadDoctorCommunicationsBadges";
import { loadDoctorExerciseCommentsForTab } from "../comments/loadDoctorExerciseCommentsForTab";
import { loadDoctorCommentPatients } from "../comments/loadDoctorCommentPatients";
import { DoctorCommunicationsShell } from "./DoctorCommunicationsShell";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

type Props = {
  searchParams: Promise<{ tab?: string; id?: string; archive?: string }>;
};

export default async function DoctorCommunicationsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const params = await searchParams;
  const initialTab = communicationsTabFromQuery(params.tab ?? null);

  const deps = buildAppDeps();

  const [badges, audience, displayIana] = await Promise.all([
    loadDoctorCommunicationsBadges(deps, getOnlineIntakeService()),
    loadDoctorAnalyticsAudience(),
    getAppDisplayTimeZone(),
  ]);

  const excludedUserIds = audience?.excludedUserIds ?? [];

  const [commentsData, patients] = await Promise.all([
    loadDoctorExerciseCommentsForTab(deps, {
      viewerUserId: session.user.userId,
      excludedUserIds,
    }),
    loadDoctorCommentPatients(
      {
        doctorClientsPort: deps.doctorClientsPort,
        programItemDiscussion: deps.programItemDiscussion,
      },
      { viewerUserId: session.user.userId },
      { excludedUserIds: excludedUserIds.length ? excludedUserIds : undefined },
    ),
  ]);

  return (
    <DoctorCommunicationsShell
      initialTab={initialTab}
      badges={badges}
      initialTabData={{
        comments: {
          feed: commentsData,
          patients,
          displayIana,
        },
      }}
    />
  );
}
