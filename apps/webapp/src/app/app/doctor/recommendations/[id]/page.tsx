import { notFound } from 'next/navigation';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { requireEntitlementForReadAction } from '@/app-layer/guards/requireEntitlement';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { DoctorAppShell } from '@/shared/ui/doctor/DoctorAppShell';
import { parseRecommendationCatalogSsrQuery } from '@/modules/recommendations/recommendationCatalogSsrQuery';
import { RECOMMENDATION_TYPE_CATEGORY_CODE } from '@/modules/recommendations/recommendationDomain';
import { parseRecommendationListFilterScope } from '@/shared/lib/doctorCatalogListStatus';
import { RecommendationForm } from '../RecommendationForm';
import { RECOMMENDATIONS_PATH } from '../paths';
import { appendRecommendationsCatalogFiltersToSearchParams } from '../recommendationsListPreserveParams';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditRecommendationPage({ params, searchParams }: PageProps) {
  const workspace = await requireDoctorWorkspaceContext();
  const session = workspace.session;
  const { id } = await params;
  const deps = buildAppDeps();
  const includePlatformBase = (await requireEntitlementForReadAction(workspace, 'exercise_catalog'))
    .ok;
  const rec = await deps.recommendations.getRecommendation(id, { includePlatformBase });
  if (!rec) notFound();
  const usageSnapshot = await deps.recommendations.getRecommendationUsage(rec.id);
  const domainCatalogItems = await deps.references.listActiveItemsByCategoryCode(
    RECOMMENDATION_TYPE_CATEGORY_CODE,
  );

  const sp = (await searchParams) ?? {};
  const catalogQuery = parseRecommendationCatalogSsrQuery(
    {
      region: typeof sp.region === 'string' ? sp.region : undefined,
      domain: typeof sp.domain === 'string' ? sp.domain : undefined,
    },
    domainCatalogItems,
  );
  const listStatus = parseRecommendationListFilterScope(sp, 'active');
  const titleSort: 'asc' | 'desc' | null =
    sp.titleSort === 'asc' || sp.titleSort === 'desc' ? sp.titleSort : null;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const hasListContext =
    q.trim() !== '' ||
    titleSort != null ||
    Boolean(catalogQuery.regionCodeForCatalog?.trim()) ||
    catalogQuery.domainForList != null ||
    listStatus !== 'active';

  const workspaceListPreserve = hasListContext
    ? {
        q: q || undefined,
        titleSort,
        regionCode: catalogQuery.regionCodeForCatalog,
        domain: catalogQuery.domainForList ?? undefined,
        listStatus,
      }
    : undefined;

  const backParams = new URLSearchParams();
  if (workspaceListPreserve) {
    appendRecommendationsCatalogFiltersToSearchParams(backParams, workspaceListPreserve);
  }
  const backHref = backParams.toString()
    ? `${RECOMMENDATIONS_PATH}?${backParams.toString()}`
    : RECOMMENDATIONS_PATH;

  return (
    <DoctorAppShell title="Редактирование рекомендации" user={session.user} backHref={backHref}>
      <RecommendationForm
        recommendation={rec}
        domainCatalogItems={domainCatalogItems}
        externalUsageSnapshot={usageSnapshot}
        backHref={backHref}
        workspaceListPreserve={workspaceListPreserve}
      />
    </DoctorAppShell>
  );
}
