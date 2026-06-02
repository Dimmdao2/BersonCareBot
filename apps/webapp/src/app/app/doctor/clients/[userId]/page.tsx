/**
 * Карточка клиента кабинета специалиста («/app/doctor/clients/[userId]»).
 */
import { notFound } from "next/navigation";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { loadDoctorClientProgramCardData } from "@/modules/doctor-client-card/loadDoctorClientProgramCardAggregates";
import { buildDoctorClientWellbeingModel } from "../buildDoctorClientWellbeingModel";
import { ClientProfileCard } from "../ClientProfileCard";

type Props = { params: Promise<{ userId: string }> };

type SearchParams = Promise<{ scope?: string; chat?: string }>;

export default async function DoctorClientProfilePage({
  params,
  searchParams,
}: Props & { searchParams: SearchParams }) {
  const session = await requireDoctorAccess();
  const { userId } = await params;
  const { scope: scopeParam, chat: chatParam } = await searchParams;
  const autoOpenChat = chatParam === "1";
  const listBasePath =
    scopeParam === "all"
      ? "/app/doctor/clients?scope=all"
      : scopeParam === "archived"
        ? "/app/doctor/clients?scope=archived"
        : "/app/doctor/clients?scope=appointments";
  const deps = buildAppDeps();
  const hasDb = Boolean(env.DATABASE_URL);
  const [profile, messageHistory, publishedTreatmentTemplates, pendingProgramTests, treatmentProgramInstances, displayTimeZone] =
    await Promise.all([
      deps.doctorClients.getClientProfile(userId),
      deps.doctorMessaging.listMessageHistory({ userId, pageSize: 10 }),
      deps.treatmentProgram.listTemplates({ includeArchived: false, status: "published" }),
      deps.treatmentProgramProgress.listPendingTestEvaluationsForPatient(userId),
      hasDb ? deps.treatmentProgramInstance.listForPatientClinicalView(userId) : Promise.resolve([]),
      getAppDisplayTimeZone(),
    ]);

  if (!profile) notFound();

  const programCardData = hasDb
    ? await loadDoctorClientProgramCardData(
        {
          treatmentProgramInstance: deps.treatmentProgramInstance,
          programItemDiscussion: deps.programItemDiscussion,
        },
        userId,
        treatmentProgramInstances,
      )
    : undefined;

  const taskSummary = hasDb
    ? await deps.specialistTasks.getPatientSummary(session.user.userId, userId)
    : null;

  const wellbeingChartModel = buildDoctorClientWellbeingModel(
    profile.symptomTrackings,
    profile.recentSymptomEntries,
    displayTimeZone,
  );

  const lfkComplexIds = profile.lfkComplexes.map((c) => c.id);
  const lfkExerciseLinesByComplexId =
    Boolean(env.DATABASE_URL) && lfkComplexIds.length > 0
      ? await deps.diaries.listLfkComplexExerciseLinesForUser({
          userId,
          complexIds: lfkComplexIds,
        })
      : {};

  const proactiveInsights =
    hasDb
      ? await deps.doctorProactiveInsights.listForPatient({
          patientUserId: userId,
          displayIana: displayTimeZone,
        })
      : [];

  return (
    <AppShell
      title={profile.identity.displayName}
      user={session.user}
      backHref={listBasePath}
      backLabel="Клиенты"
      variant="doctor"
    >
      <ClientProfileCard
        profile={profile}
        messageHistory={messageHistory.items}
        userId={userId}
        listBasePath={listBasePath}
        profileListScope={scopeParam}
        isAdmin={session.user.role === "admin"}
        canPermanentDelete={session.user.role === "admin" && Boolean(session.adminMode)}
        canEditClientProfile={session.user.role === "admin" && Boolean(session.adminMode)}
        publishedTreatmentProgramTemplates={publishedTreatmentTemplates.map((t) => ({
          id: t.id,
          title: t.title,
        }))}
        assignTreatmentProgramEnabled={Boolean(env.DATABASE_URL)}
        pendingProgramTestEvaluations={pendingProgramTests}
        treatmentProgramInstancesInitial={
          Boolean(env.DATABASE_URL) ? treatmentProgramInstances : undefined
        }
        lfkExerciseLinesByComplexId={lfkExerciseLinesByComplexId}
        autoOpenChat={autoOpenChat}
        programCardAggregates={programCardData?.aggregates}
        carePlanOverview={programCardData?.carePlan ?? null}
        programInbox={programCardData?.programInbox ?? []}
        recentProgramChanges={programCardData?.recentProgramChanges ?? []}
        displayTimeZone={displayTimeZone}
        wellbeingChartModel={wellbeingChartModel}
        taskSummary={taskSummary}
        proactiveInsights={proactiveInsights}
      />
    </AppShell>
  );
}
