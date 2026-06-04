import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { BroadcastDeliveryArchiveClient } from "../BroadcastDeliveryArchiveClient";

export default async function DoctorBroadcastDeliveryArchivePage() {
  const session = await requireDoctorAccess();

  return (
    <DoctorAppShell title="Архив доставки рассылок" user={session.user}>
      <BroadcastDeliveryArchiveClient />
    </DoctorAppShell>
  );
}
