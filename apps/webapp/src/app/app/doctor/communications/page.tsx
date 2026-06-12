import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { loadDoctorAnalyticsAudience } from "@/app-layer/analytics/loadAnalyticsAudience";
import { communicationsTabFromQuery } from "./doctorCommunicationsTabs";
import { loadDoctorCommunicationsBadges } from "./loadDoctorCommunicationsBadges";
import { loadDoctorExerciseCommentsForTab } from "../comments/loadDoctorExerciseCommentsForTab";
import { DoctorCommunicationsShell } from "./DoctorCommunicationsShell";

type Props = {
  searchParams: Promise<{ tab?: string; id?: string; archive?: string }>;
};

export default async function DoctorCommunicationsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const params = await searchParams;
  const initialTab = communicationsTabFromQuery(params.tab ?? null);

  const deps = buildAppDeps();

  const [badges, audience] = await Promise.all([
    loadDoctorCommunicationsBadges(deps, getOnlineIntakeService()),
    loadDoctorAnalyticsAudience(),
  ]);

  const commentsData = await loadDoctorExerciseCommentsForTab(deps, {
    viewerUserId: session.user.userId,
    excludedUserIds: audience?.excludedUserIds ?? [],
  });

  return (
    <DoctorCommunicationsShell
      initialTab={initialTab}
      badges={badges}
      initialTabData={{ comments: commentsData }}
    />
  );
}
