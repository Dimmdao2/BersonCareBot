import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { routePaths } from "@/app-layer/routes/paths";
import { LfkIntakeClient } from "./LfkIntakeClient";

export default async function LfkIntakePage() {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);

  return <LfkIntakeClient />;
}
