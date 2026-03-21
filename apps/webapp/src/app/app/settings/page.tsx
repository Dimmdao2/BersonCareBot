import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";

export default async function SettingsPage() {
  const session = await getCurrentSession();
  const target = session?.user.role === "client" ? "/app/patient/profile" : "/app/doctor";
  redirect(target);
}
