import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

export default async function DoctorOnlineIntakePage() {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.root);

  return (
    <AppShell title="Онлайн-заявки пациентов" user={session.user} variant="doctor">
      <h1 className="text-lg font-semibold">Онлайн-заявки пациентов</h1>
      <DoctorOnlineIntakeClient />
    </AppShell>
  );
}
