import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { LfkIntakeClient } from "./LfkIntakeClient";

export default async function LfkIntakePage() {
  await requirePatientAccessWithPhone(routePaths.intakeLfk);
  return <LfkIntakeClient />;
}
