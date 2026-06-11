/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Чат поддержки с пациентами. Массовые рассылки и журнал — `/app/doctor/broadcasts`.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";
import { loadDoctorCommunicationsBadges } from "../communications/loadDoctorCommunicationsBadges";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();
  const badges = await loadDoctorCommunicationsBadges(buildAppDeps(), getOnlineIntakeService());

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="chats" badges={badges} />
      <DoctorSupportInbox />
    </DoctorAppShell>
  );
}
