import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { routePaths } from "@/app-layer/routes/paths";
import { NutritionIntakeClient } from "./NutritionIntakeClient";

export default async function NutritionIntakePage() {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);

  return <NutritionIntakeClient />;
}
