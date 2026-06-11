import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

export default async function DoctorOnlineIntakePage() {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.root);

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="intake" />
      <h1 className="text-base font-semibold tracking-tight text-foreground">Онлайн-заявки пациентов</h1>
      <DoctorOnlineIntakeClient />
    </DoctorAppShell>
  );
}
