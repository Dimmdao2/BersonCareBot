'use server';

import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { formatDoctorFioShort } from '@/shared/lib/fio';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { TreatmentProgramInstanceDetail } from '@/modules/treatment-program/types';
import type { TreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes';
import { buildTreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-templates/buildTreatmentProgramLibraryPickers';

type Deps = ReturnType<typeof buildAppDeps>;

export type DoctorPatientProgramEditorBootstrap = {
  initial: TreatmentProgramInstanceDetail;
  patientName: string | null;
  initialTestResults: Awaited<
    ReturnType<Deps['treatmentProgramProgress']['listTestResultsForInstance']>
  >;
  initialAttemptAcceptMap: Awaited<
    ReturnType<Deps['treatmentProgramProgress']['getDoctorAttemptAcceptMap']>
  >;
  appDisplayTimeZone: string;
  treatmentProgramLibrary: TreatmentProgramLibraryPickers;
  initialDiscussionUnreadCountByStageItemId: Record<string, number>;
};

/**
 * Единая ленивая загрузка редактора программы внутри карточки пациента.
 * Её используют и прямой route, и клиентское переключение вкладки ЛФК, чтобы
 * вкладка не создавала второй PatientCardClient и не перемонтировала шапку.
 */
export async function loadDoctorPatientProgramEditorBootstrap(
  patientUserId: string,
  instanceId: string,
): Promise<DoctorPatientProgramEditorBootstrap | null> {
  if (
    !z.string().uuid().safeParse(patientUserId).success ||
    !z.string().uuid().safeParse(instanceId).success
  ) {
    return null;
  }

  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentityForOrganization(
    patientUserId,
    workspace.organizationId,
    workspace,
  );
  if (!identity) return null;

  let initial: TreatmentProgramInstanceDetail;
  try {
    initial = await withDoctorWorkspacePrincipal(workspace, () =>
      deps.treatmentProgramInstance.getInstanceForPatient(identity.userId, instanceId),
    );
  } catch {
    return null;
  }

  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const [
    initialTestResults,
    initialAttemptAcceptMap,
    discussionUnreadCounts,
    appDisplayTimeZone,
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionItems,
  ] = await withDoctorWorkspacePrincipal(workspace, () =>
    Promise.all([
      deps.treatmentProgramProgress.listTestResultsForInstance(instanceId),
      deps.treatmentProgramProgress.getDoctorAttemptAcceptMap(instanceId),
      deps.programItemDiscussion.listUnreadCountsForViewerByStageItems({
        stageItemIds: initial.stages.flatMap((stage) => stage.items.map((item) => item.id)),
        viewerUserId: workspace.session.user.userId,
      }),
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
      deps.references.listActiveItemsByCategoryCode('body_region'),
    ]),
  );

  const bodyRegionIdToCode = Object.fromEntries(
    bodyRegionItems.map((item) => [item.id, item.code]),
  );

  return {
    initial,
    patientName: formatDoctorFioShort(
      {
        lastName: identity.lastName ?? null,
        firstName: identity.firstName ?? null,
        patronymic: null,
      },
      identity.displayName,
    ),
    initialTestResults,
    initialAttemptAcceptMap,
    appDisplayTimeZone,
    treatmentProgramLibrary: buildTreatmentProgramLibraryPickers({
      exercises,
      lfkTemplates,
      testSets,
      clinicalTests,
      recommendations,
      contentPagesAll,
      bodyRegionIdToCode,
    }),
    initialDiscussionUnreadCountByStageItemId: Object.fromEntries(
      discussionUnreadCounts.map((row) => [row.stageItemId, row.unread]),
    ),
  };
}
