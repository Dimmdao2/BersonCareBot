import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { AppShell } from "@/shared/ui/AppShell";
import { PatientMessagesClient } from "./PatientMessagesClient";

export default async function PatientMessagesPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientMessages);
  return (
    <AppShell title="Чат с Дмитрием" user={session.user} variant="patient">
      <PatientMessagesClient />
    </AppShell>
  );
}
