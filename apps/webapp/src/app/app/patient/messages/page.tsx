import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientMessagesClient } from "./PatientMessagesClient";

export default async function PatientMessagesPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientMessages);
  return (
    <AppShell title="Сообщения" user={session.user} backHref={routePaths.patient} backLabel="Меню" variant="patient">
      <PatientMessagesClient />
    </AppShell>
  );
}
