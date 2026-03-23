import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccess } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PlaceholderPage } from "@/shared/ui/PlaceholderPage";

export default async function PatientHelpPage() {
  const session = await requirePatientAccess(routePaths.patientHelp);
  return (
    <AppShell title="Справка" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <PlaceholderPage title="Справка" />
    </AppShell>
  );
}
