import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { NutritionIntakeClient } from "./NutritionIntakeClient";

export default async function NutritionIntakePage() {
  const session = await requirePatientAccessWithPhone(routePaths.intakeNutrition);

  return (
    <PatientAppShell
      title="Онлайн-запрос"
      user={session.user}
      backHref={routePaths.bookingNew}
      backLabel="Назад"
     
    >
      <NutritionIntakeClient />
    </PatientAppShell>
  );
}
