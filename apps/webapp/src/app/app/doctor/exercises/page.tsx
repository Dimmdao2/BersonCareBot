import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { DoctorPageHeader } from '@/shared/ui/doctor/shell/DoctorPageHeader';
import { doctorCatalogViewFromSearchParams } from '@/shared/lib/doctorCatalogViewPreference';
import { parseRecommendationListFilterScope } from '@/shared/lib/doctorCatalogListStatus';
import {
  parseDoctorCatalogRegionQueryParam,
  resolveBodyRegionRefIdFromCatalogCode,
} from '@/shared/lib/doctorCatalogRegionQuery';
import { doctorCatalogClientFilterUrlHints } from '@/shared/lib/doctorCatalogClientUrlSync';
import type { Exercise, ExerciseUsageSnapshot } from '@/modules/lfk-exercises/types';
import {
  EXERCISE_LOAD_TYPE_CATEGORY_CODE,
  exerciseLoadTypeWriteAllowSet,
  parseExerciseLoadFilterQueryParam,
} from '@/modules/lfk-exercises/exerciseLoadTypeReference';
import { ExercisesPageClient } from './ExercisesPageClient';

type PageProps = {
  searchParams?: Promise<{
    q?: string;
    region?: string;
    load?: string;
    view?: string;
    selected?: string;
    titleSort?: string;
    status?: string;
  }>;
};

export default async function DoctorExercisesPage({ searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const sp = (await searchParams) ?? {};
  const q = typeof sp.q === 'string' ? sp.q : '';
  const regionParsed = parseDoctorCatalogRegionQueryParam(sp.region);

  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const [bodyRegionItems, loadTypeRefItems] = await Promise.all([
    deps.references.listActiveItemsByCategoryCode('body_region'),
    deps.references.listActiveItemsByCategoryCode(EXERCISE_LOAD_TYPE_CATEGORY_CODE),
  ]);
  const loadAllow = exerciseLoadTypeWriteAllowSet(loadTypeRefItems);
  const loadType = parseExerciseLoadFilterQueryParam(
    typeof sp.load === 'string' ? sp.load : undefined,
    loadAllow,
  );

  const { initialViewMode, viewLockedByUrl } = doctorCatalogViewFromSearchParams(
    typeof sp.view === 'string' ? sp.view : undefined,
  );
  const selectedExerciseId =
    typeof sp.selected === 'string' && sp.selected.trim() ? sp.selected.trim() : null;
  const titleSort = sp.titleSort === 'asc' || sp.titleSort === 'desc' ? sp.titleSort : null;
  const listStatus = parseRecommendationListFilterScope(sp, 'active');

  type DoctorExerciseSelection = { exercise: Exercise | null; usage: ExerciseUsageSnapshot | null };

  const listPromise = deps.lfkExercises.listExercises({
    archiveListScope: listStatus,
    includePlatformBase,
    regionRefId: resolveBodyRegionRefIdFromCatalogCode(bodyRegionItems, regionParsed.regionCode),
  });
  const bodyRegionIdToCode = Object.fromEntries(bodyRegionItems.map((it) => [it.id, it.code]));

  const doctorExerciseSelectionPromise: Promise<DoctorExerciseSelection> = selectedExerciseId
    ? deps.lfkExercises
        .getExercise(selectedExerciseId, { includePlatformBase })
        .then(async (ex) => {
          if (!ex) return { exercise: null, usage: null };
          const usage =
            ex.ownerKind === 'organization'
              ? await deps.lfkExercises.getExerciseUsage(ex.id)
              : null;
          return { exercise: ex, usage };
        })
        .catch(() => ({ exercise: null, usage: null }))
    : Promise.resolve({ exercise: null, usage: null });
  return (
    <DoctorAppShell
      title="Упражнения ЛФК"
      user={session.user}
      backHref="/app/doctor"
      layout="full-height"
    >
      <DoctorPageHeader title="Упражнения ЛФК" />
      <ExercisesPageClient
        listPromise={listPromise}
        doctorExerciseSelectionPromise={doctorExerciseSelectionPromise}
        initialViewMode={initialViewMode}
        viewLockedByUrl={viewLockedByUrl}
        initialTitleSort={titleSort}
        bodyRegionIdToCode={bodyRegionIdToCode}
        bodyRegionItems={bodyRegionItems}
        loadTypeItems={loadTypeRefItems}
        filters={{
          q,
          regionCode: regionParsed.regionCode,
          loadType,
          listStatus,
          ...doctorCatalogClientFilterUrlHints(sp),
        }}
      />
    </DoctorAppShell>
  );
}
