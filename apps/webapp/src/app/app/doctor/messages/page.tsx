/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Чат поддержки с пациентами. Массовые рассылки и журнал — `/app/doctor/broadcasts`.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Сообщения" user={session.user}>
      <DoctorSupportInbox />
    </DoctorAppShell>
  );
}
