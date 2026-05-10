import { redirect } from "next/navigation";
import { routePaths } from "@/app-layer/routes/paths";

export default function PatientNotificationsPageRedirect() {
  redirect(routePaths.profile);
}
