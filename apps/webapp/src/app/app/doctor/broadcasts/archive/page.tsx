import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { BroadcastDeliveryArchiveClient } from "../BroadcastDeliveryArchiveClient";

export default async function DoctorBroadcastDeliveryArchivePage() {
  const session = await requireDoctorAccess();

  return (
    <AppShell title="Архив доставки рассылок" user={session.user} variant="doctor">
      <BroadcastDeliveryArchiveClient />
    </AppShell>
  );
}
