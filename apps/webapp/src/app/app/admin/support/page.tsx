import { requirePlatformOperationsPage } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { PlatformSupportInbox } from "./PlatformSupportInbox";

export default async function PlatformSupportPage() {
  await requirePlatformOperationsPage();

  return (
    <DoctorAppShell title="Обращения">
      <DoctorPageHeader
        title="Обращения"
        subtitle="Переписка пользователей с поддержкой платформы"
      />
      <PlatformSupportInbox />
    </DoctorAppShell>
  );
}
