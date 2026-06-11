import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { routePaths } from "@/app-layer/routes/paths";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";
import { loadDoctorCommunicationsBadges } from "../communications/loadDoctorCommunicationsBadges";
import { DoctorOnlineIntakeClient } from "./DoctorOnlineIntakeClient";

export default async function DoctorOnlineIntakePage() {
  const session = await getCurrentSession();
  if (!session) redirect(routePaths.root);
  if (!canAccessDoctor(session.user.role)) redirect(routePaths.root);

  const badges = await loadDoctorCommunicationsBadges(buildAppDeps(), getOnlineIntakeService());

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="intake" badges={badges} />
      <h1 className="text-base font-semibold tracking-tight text-foreground">Онлайн-заявки пациентов</h1>
      <DoctorOnlineIntakeClient />
    </DoctorAppShell>
  );
}
