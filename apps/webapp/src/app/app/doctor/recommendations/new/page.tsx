import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { RecommendationForm } from "../RecommendationForm";
import { RECOMMENDATIONS_PATH } from "../paths";

export default async function NewRecommendationPage() {
  const session = await requireDoctorAccess();
  return (
    <AppShell title="Новая рекомендация" user={session.user} variant="doctor" backHref={RECOMMENDATIONS_PATH}>
      <RecommendationForm />
    </AppShell>
  );
}
