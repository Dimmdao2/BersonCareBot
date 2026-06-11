/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Чат поддержки с пациентами. Массовые рассылки и журнал — `/app/doctor/broadcasts`.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorCommunicationsTabsNav } from "../communications/DoctorCommunicationsTabsNav";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Коммуникации" user={session.user}>
      <DoctorCommunicationsTabsNav activeTab="chats" />
      <DoctorSupportInbox />
    </DoctorAppShell>
  );
}
