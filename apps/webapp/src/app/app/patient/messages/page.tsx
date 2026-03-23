import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PlaceholderPage } from "@/shared/ui/PlaceholderPage";

export default async function PatientMessagesPage() {
  const session = await requirePatientAccess(routePaths.patientMessages);
  return (
    <AppShell title="Сообщения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <PlaceholderPage title="Сообщения" />
    </AppShell>
  );
}
