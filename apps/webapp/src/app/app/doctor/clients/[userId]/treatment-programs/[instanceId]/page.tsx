/**
 * Экземпляр программы лечения пациента (врач): просмотр и override комментариев.
 */
import { notFound } from "next/navigation";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { buildTreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers";
import { TreatmentProgramInstanceDetailClient } from "./TreatmentProgramInstanceDetailClient";

type Props = {
  params: Promise<{ userId: string; instanceId: string }>;
  searchParams: Promise<{ scope?: string; discussionItem?: string; focusItemId?: string }>;
};

export default async function DoctorPatientTreatmentProgramPage({ params, searchParams }: Props) {
  const session = await requireDoctorAccess();
  const { userId, instanceId } = await params;
  const { scope: scopeParam, discussionItem: discussionItemParam, focusItemId: focusItemIdParam } =
    await searchParams;

  const deps = buildAppDeps();
  let detail;
  try {
    detail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, instanceId);
  } catch {
    notFound();
  }

  const [
    testResults,
    attemptAcceptMap,
    programEvents,
    programActionLog,
    appDisplayTimeZone,
    clientProfile,
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    discussionDoctorReplyFlag,
    bodyRegionItems,
  ] = await Promise.all([
    deps.treatmentProgramProgress.listTestResultsForInstance(instanceId),
    deps.treatmentProgramProgress.getDoctorAttemptAcceptMap(instanceId),
    deps.treatmentProgramInstance.listProgramEvents(instanceId),
    deps.treatmentProgramProgress.listProgramActionLogForInstance(instanceId),
    getAppDisplayTimeZone(),
    deps.doctorClients.getClientProfile(userId),
    deps.lfkExercises.listExercises({ includeArchived: false }),
    deps.lfkTemplates.listTemplates({ statusIn: ["draft", "published"], includeExerciseDetails: true }),
    deps.testSets.listTestSets({ includeArchived: false }),
    deps.clinicalTests.listClinicalTests({ archiveScope: "active" }),
    deps.recommendations.listRecommendations({ includeArchived: false }),
    deps.contentPages.listAll(),
    deps.systemSettings.getSetting("patient_program_discussion_doctor_reply_from_log_enabled", "admin"),
    deps.references.listActiveItemsByCategoryCode("body_region"),
  ]);

  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const treatmentProgramLibrary = buildTreatmentProgramLibraryPickers({
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionIdToCode,
  });

  const patientDisplayNameRaw = clientProfile?.identity.displayName?.trim() ?? "";
  const patientDisplayName = patientDisplayNameRaw !== "" ? patientDisplayNameRaw : "Имя не указано";
  const doctorReplyFromLogEnabled =
    discussionDoctorReplyFlag?.valueJson !== null &&
    typeof discussionDoctorReplyFlag?.valueJson === "object" &&
    (discussionDoctorReplyFlag.valueJson as Record<string, unknown>).value === true;

  const discussionItemRaw = discussionItemParam?.trim();
  const initialOpenDiscussionItemId =
    discussionItemRaw && z.string().uuid().safeParse(discussionItemRaw).success ? discussionItemRaw : undefined;

  const focusItemIdRaw = focusItemIdParam?.trim();
  const initialFocusTestResultId =
    focusItemIdRaw && z.string().uuid().safeParse(focusItemIdRaw).success ? focusItemIdRaw : undefined;

  const qs = scopeParam ? `?scope=${encodeURIComponent(scopeParam)}` : "";
  const backHref = `/app/doctor/clients/${encodeURIComponent(userId)}${qs}`;

  return (
    <AppShell
      title={detail.title}
      user={session.user}
      backHref={backHref}
      backLabel="Карточка клиента"
      variant="doctor"
    >
      <TreatmentProgramInstanceDetailClient
        patientProfileHref={backHref}
        patientDisplayName={patientDisplayName}
        initial={detail}
        initialTestResults={testResults}
        initialAttemptAcceptMap={attemptAcceptMap}
        initialEvents={programEvents}
        initialActionLog={programActionLog}
        currentUserId={session.user.userId}
        isAdmin={session.user.role === "admin"}
        appDisplayTimeZone={appDisplayTimeZone}
        treatmentProgramLibrary={treatmentProgramLibrary}
        doctorReplyFromLogEnabled={doctorReplyFromLogEnabled}
        initialOpenDiscussionItemId={initialOpenDiscussionItemId}
        initialFocusTestResultId={initialFocusTestResultId}
      />
    </AppShell>
  );
}
