import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { env } from "@/config/env";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { loadDoctorClientProgramCardData } from "@/modules/doctor-client-card/loadDoctorClientProgramCardAggregates";
import type { ClientProfile } from "@/modules/doctor-clients/service";
import type { MessageLogEntry } from "@/modules/doctor-messaging/ports";
import type { LfkComplexExerciseLine } from "@/modules/diaries/types";
import type {
  DoctorClientActiveProgramTreeModel,
  DoctorClientOverviewCarePlanModel,
  DoctorClientProgramCardAggregates,
  DoctorClientProgramInboxRow,
  DoctorClientRecentProgramChangeRow,
  DoctorClientTaskSummary,
} from "@/modules/doctor-client-card/types";
import type { WellbeingWeekChartModel } from "@/modules/diaries/buildWellbeingWeekChartData";
import type { PendingProgramTestEvaluationRow, TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import { buildDoctorClientWellbeingModel } from "./buildDoctorClientWellbeingModel";

export type DoctorClientProfileCardPageProps = {
  profile: ClientProfile;
  messageHistory: MessageLogEntry[];
  userId: string;
  listBasePath: string;
  profileListScope?: string;
  publishedTreatmentProgramTemplates: { id: string; title: string }[];
  assignTreatmentProgramEnabled: boolean;
  pendingProgramTestEvaluations: PendingProgramTestEvaluationRow[];
  treatmentProgramInstancesInitial?: TreatmentProgramInstanceSummary[];
  lfkExerciseLinesByComplexId: Record<string, LfkComplexExerciseLine[]>;
  autoOpenChat: boolean;
  programCardAggregates: DoctorClientProgramCardAggregates;
  carePlanOverview: DoctorClientOverviewCarePlanModel | null;
  activeProgramTree: DoctorClientActiveProgramTreeModel | null;
  programInbox: DoctorClientProgramInboxRow[];
  recentProgramChanges: DoctorClientRecentProgramChangeRow[];
  displayTimeZone: string;
  wellbeingChartModel: WellbeingWeekChartModel;
  taskSummary: DoctorClientTaskSummary | null;
  proactiveInsights: ProactiveInsightRow[];
};

export type LoadDoctorClientProfileCardResult =
  | { kind: "not_found" }
  | { kind: "found"; props: DoctorClientProfileCardPageProps };

function listBasePathForScope(scopeParam: string | undefined): string {
  if (scopeParam === "all") return "/app/doctor/clients?scope=all";
  if (scopeParam === "archived") return "/app/doctor/clients?scope=archived";
  return "/app/doctor/clients?scope=appointments";
}

/** Единая загрузка props для `ClientProfileCard` (RSC). */
export async function loadDoctorClientProfileCardProps(input: {
  userId: string;
  doctorUserId: string;
  scopeParam?: string;
  autoOpenChat?: boolean;
}): Promise<LoadDoctorClientProfileCardResult> {
  const { userId, doctorUserId, scopeParam, autoOpenChat = false } = input;
  const deps = buildAppDeps();
  const hasDb = Boolean(env.DATABASE_URL);
  const listBasePath = listBasePathForScope(scopeParam);

  const [profile, messageHistory, publishedTreatmentTemplates, pendingProgramTests, treatmentProgramInstances, displayTimeZone] =
    await Promise.all([
      deps.doctorClients.getClientProfile(userId),
      deps.doctorMessaging.listMessageHistory({ userId, pageSize: 10 }),
      deps.treatmentProgram.listTemplates({ includeArchived: false, status: "published" }),
      deps.treatmentProgramProgress.listPendingTestEvaluationsForPatient(userId),
      hasDb ? deps.treatmentProgramInstance.listForPatientClinicalView(userId) : Promise.resolve([]),
      getAppDisplayTimeZone(),
    ]);

  if (!profile) return { kind: "not_found" };

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
    ? await deps.specialistTasks.getPatientSummary(doctorUserId, userId)
    : null;

  const wellbeingChartModel = buildDoctorClientWellbeingModel(
    profile.symptomTrackings,
    profile.recentSymptomEntries,
    displayTimeZone,
  );

  const lfkComplexIds = profile.lfkComplexes.map((c) => c.id);
  const lfkExerciseLinesByComplexId =
    hasDb && lfkComplexIds.length > 0
      ? await deps.diaries.listLfkComplexExerciseLinesForUser({
          userId,
          complexIds: lfkComplexIds,
        })
      : {};

  const proactiveInsights = hasDb
    ? await deps.doctorProactiveInsights.listForPatient({
        patientUserId: userId,
        displayIana: displayTimeZone,
      })
    : [];

  return {
    kind: "found",
    props: {
      profile,
      messageHistory: messageHistory.items,
      userId,
      listBasePath,
      profileListScope: scopeParam,
      publishedTreatmentProgramTemplates: publishedTreatmentTemplates.map((t) => ({
        id: t.id,
        title: t.title,
      })),
      assignTreatmentProgramEnabled: hasDb,
      pendingProgramTestEvaluations: pendingProgramTests,
      treatmentProgramInstancesInitial: hasDb ? treatmentProgramInstances : undefined,
      lfkExerciseLinesByComplexId,
      autoOpenChat,
      programCardAggregates: programCardData?.aggregates ?? {
        newCommentsCount: 0,
        patientMediaCount: 0,
        planNotOpened: false,
        lastPlanMutationEventAt: null,
      },
      carePlanOverview: programCardData?.carePlan ?? null,
      activeProgramTree: programCardData?.activeProgramTree ?? null,
      programInbox: programCardData?.programInbox ?? [],
      recentProgramChanges: programCardData?.recentProgramChanges ?? [],
      displayTimeZone,
      wellbeingChartModel,
      taskSummary,
      proactiveInsights,
    },
  };
}
