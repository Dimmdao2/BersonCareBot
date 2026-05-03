import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { RECOMMENDATION_TYPE_CATEGORY_CODE } from "@/modules/recommendations/recommendationDomain";
import { RecommendationForm } from "../RecommendationForm";
import { RECOMMENDATIONS_PATH } from "../paths";

export default async function NewRecommendationPage() {
  const session = await requireDoctorAccess();
  const deps = buildAppDeps();
  const domainCatalogItems = await deps.references.listActiveItemsByCategoryCode(
    RECOMMENDATION_TYPE_CATEGORY_CODE,
  );
  return (
    <AppShell title="Новая рекомендация" user={session.user} variant="doctor" backHref={RECOMMENDATIONS_PATH}>
      <RecommendationForm domainCatalogItems={domainCatalogItems} />
    </AppShell>
  );
}
