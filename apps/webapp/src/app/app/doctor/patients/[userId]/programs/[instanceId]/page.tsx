/**
 * /app/doctor/patients/[userId]/programs/[instanceId]
 *
 * Program instance editor embedded inside the patient card layout (PROG-04).
 * Shows the full patient header + tabs, with the Программа tab rendering
 * TreatmentProgramInstanceDetailClient inline instead of navigating away.
 */
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import {
  requireEntitlementForReadAction,
} from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { routePaths } from '@/app-layer/routes/paths';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { buildTreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers';
import { TreatmentProgramInstanceDetailClient } from '@/app/app/doctor/clients/[userId]/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient';
import { PatientCardClient } from '../../PatientCardClient';
import { patientCardHref } from '../../../patientCardHref';
import {
  loadDoctorPatientCardShellMeta,
  loadDoctorPatientCardTabBootstrap,
} from '../../../loadDoctorPatientCardPageBootstrap';

type Props = {
  params: Promise<{ userId: string; instanceId: string }>;
  searchParams: Promise<{ scope?: string; discussionItem?: string; focusItemId?: string }>;
};

export default async function DoctorPatientProgramEmbeddedPage({ params, searchParams }: Props) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { userId, instanceId } = await params;
  const {
    scope: scopeParam,
    discussionItem: discussionItemParam,
    focusItemId: focusItemIdParam,
  } = await searchParams;

  if (
    !z.string().uuid().safeParse(userId).success ||
    !z.string().uuid().safeParse(instanceId).success
  ) {
    notFound();
  }

  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;

  let detail;
  try {
    detail = await deps.treatmentProgramInstance.getInstanceForPatient(userId, instanceId);
  } catch {
    notFound();
  }

  const [
    cardHeader,
    testResults,
    attemptAcceptMap,
    programEvents,
    programActionLog,
    appDisplayTimeZone,
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    discussionDoctorReplyFlag,
    bodyRegionItems,
  ] = await Promise.all([
    deps.doctorClients.getPatientCardHeader(userId),
    deps.treatmentProgramProgress.listTestResultsForInstance(instanceId),
    deps.treatmentProgramProgress.getDoctorAttemptAcceptMap(instanceId),
    deps.treatmentProgramInstance.listProgramEvents(instanceId),
    deps.treatmentProgramProgress.listProgramActionLogForInstance(instanceId),
    getAppDisplayTimeZone(),
    deps.lfkExercises.listExercises({ includeArchived: false, includePlatformBase }),
    deps.lfkTemplates.listTemplates({
      statusIn: ['draft', 'published'],
      includeExerciseDetails: true,
      includePlatformBase,
    }),
    deps.testSets.listTestSets({ includeArchived: false }),
    deps.clinicalTests.listClinicalTests({ archiveScope: 'active' }),
    deps.recommendations.listRecommendations({ includeArchived: false }),
    deps.contentPages.listAll(),
    deps.systemSettings.getSetting(
      'patient_program_discussion_doctor_reply_from_log_enabled',
      'admin',
    ),
    deps.references.listActiveItemsByCategoryCode('body_region'),
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

  const patientDisplayNameRaw = cardHeader?.identity.displayName?.trim() ?? '';
  const patientDisplayName =
    patientDisplayNameRaw !== '' ? patientDisplayNameRaw : 'Имя не указано';

  const doctorReplyFromLogEnabled =
    discussionDoctorReplyFlag?.valueJson !== null &&
    typeof discussionDoctorReplyFlag?.valueJson === 'object' &&
    (discussionDoctorReplyFlag.valueJson as Record<string, unknown>).value === true;

  const discussionItemRaw = discussionItemParam?.trim();
  const initialOpenDiscussionItemId =
    discussionItemRaw && z.string().uuid().safeParse(discussionItemRaw).success
      ? discussionItemRaw
      : undefined;

  const focusItemIdRaw = focusItemIdParam?.trim();
  const initialFocusTestResultId =
    focusItemIdRaw && z.string().uuid().safeParse(focusItemIdRaw).success
      ? focusItemIdRaw
      : undefined;

  const patientCardTabHref = patientCardHref(userId, { tab: 'program' });

  const tabPromise = loadDoctorPatientCardTabBootstrap(deps, workspace, userId, 'program');
  const shellMeta = await loadDoctorPatientCardShellMeta(deps, workspace, userId, 'program');

  const embeddedEditor = (
    <TreatmentProgramInstanceDetailClient
      patientProfileHref={patientCardTabHref}
      patientDisplayName={patientDisplayName}
      initial={detail}
      initialTestResults={testResults}
      initialAttemptAcceptMap={attemptAcceptMap}
      initialEvents={programEvents}
      initialActionLog={programActionLog}
      currentUserId={session.user.userId}
      isAdmin={session.user.role === 'admin'}
      appDisplayTimeZone={appDisplayTimeZone}
      treatmentProgramLibrary={treatmentProgramLibrary}
      doctorReplyFromLogEnabled={doctorReplyFromLogEnabled}
      initialOpenDiscussionItemId={initialOpenDiscussionItemId}
      initialFocusTestResultId={initialFocusTestResultId}
    />
  );

  return (
    <DoctorAppShell
      title="Карточка пациента"
      user={session.user}
      backHref={routePaths.doctorPatients}
    >
      <PatientCardClient
        shellMeta={shellMeta}
        tabPromise={tabPromise}
        initialTab="program"
        embeddedProgramContent={embeddedEditor}
        patientListHref={routePaths.doctorPatients}
      />
    </DoctorAppShell>
  );
}
