import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

export default async function ManagementPage() {
  redirect(`${routePaths.settings}?tab=organization`);
}
