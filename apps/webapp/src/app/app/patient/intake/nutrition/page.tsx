import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { NutritionIntakeClient } from "./NutritionIntakeClient";

export default async function NutritionIntakePage() {
  const session = await requirePatientAccessWithPhone(routePaths.intakeNutrition);

  return (
    <AppShell
      title="Онлайн-запрос"
      user={session.user}
      backHref={routePaths.bookingNew}
      backLabel="Назад"
      variant="patient"
    >
      <NutritionIntakeClient />
    </AppShell>
  );
}
