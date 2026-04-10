import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { NutritionIntakeClient } from "./NutritionIntakeClient";

export default async function NutritionIntakePage() {
  await requirePatientAccessWithPhone(routePaths.intakeNutrition);
  return <NutritionIntakeClient />;
}
