import { notFound } from "next/navigation";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { AppShell } from "@/shared/ui/AppShell";
import { RecommendationForm } from "../RecommendationForm";
import { RECOMMENDATIONS_PATH } from "../paths";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditRecommendationPage({ params }: PageProps) {
  const session = await requireDoctorAccess();
  const { id } = await params;
  const deps = buildAppDeps();
  const rec = await deps.recommendations.getRecommendation(id);
  if (!rec || rec.isArchived) notFound();
  const usageSnapshot = await deps.recommendations.getRecommendationUsage(rec.id);

  return (
    <AppShell
      title="Редактирование рекомендации"
      user={session.user}
      variant="doctor"
      backHref={RECOMMENDATIONS_PATH}
    >
      <RecommendationForm recommendation={rec} externalUsageSnapshot={usageSnapshot} />
    </AppShell>
  );
}
