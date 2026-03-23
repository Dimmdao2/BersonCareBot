import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PlaceholderPage } from "@/shared/ui/PlaceholderPage";

export default async function PatientInstallPage() {
  const session = await requirePatientAccess(routePaths.patientInstall);
  return (
    <AppShell title="Установить приложение" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <PlaceholderPage title="Установка приложения" />
    </AppShell>
  );
}
