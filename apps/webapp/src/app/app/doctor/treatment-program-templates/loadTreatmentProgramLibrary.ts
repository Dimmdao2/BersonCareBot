'use server';

import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import type { TreatmentProgramLibraryPickers } from '@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes';
import { buildTreatmentProgramLibraryPickers } from './buildTreatmentProgramLibraryPickers';

/** Inactive constructor surface: load related catalogs only when the editor opens. */
export async function loadTreatmentProgramLibrary(): Promise<TreatmentProgramLibraryPickers> {
  const workspace = await requireDoctorWorkspaceContext();
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;

  const [
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionItems,
  ] = await Promise.all([
    deps.lfkExercises.listExercises({ includeArchived: false, includePlatformBase }),
    deps.lfkTemplates.listTemplates({
      statusIn: ['draft', 'published'],
      includeExerciseDetails: true,
      includePlatformBase,
    }),
    deps.testSets.listTestSets({ archiveScope: 'active', publicationScope: 'published' }),
    deps.clinicalTests.listClinicalTests({ archiveScope: 'active' }),
    deps.recommendations.listRecommendations({ includeArchived: false }),
    deps.contentPages.listAll(),
    deps.references.listActiveItemsByCategoryCode('body_region'),
  ]);

  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  return buildTreatmentProgramLibraryPickers({
    exercises,
    lfkTemplates,
    testSets,
    clinicalTests,
    recommendations,
    contentPagesAll,
    bodyRegionIdToCode,
  });
}
