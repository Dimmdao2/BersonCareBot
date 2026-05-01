/**
 * Сообщения кабинета специалиста («/app/doctor/messages»).
 * Чат поддержки с пациентами. Массовые рассылки и журнал — `/app/doctor/broadcasts`.
 */
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { DoctorSupportInbox } from "./DoctorSupportInbox";

export default async function DoctorMessagesPage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Сообщения" user={session.user} variant="doctor">
      <DoctorSupportInbox />
    </AppShell>
  );
}
