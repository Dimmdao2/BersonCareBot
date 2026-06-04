import { routePaths } from "@/app-layer/routes/paths";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { PatientMessagesClient } from "./PatientMessagesClient";

export default async function PatientMessagesPage() {
  const session = await requirePatientAccessWithPhone(routePaths.patientMessages);
  return (
    <PatientAppShell title="Чат с Дмитрием" user={session.user}>
      <PatientMessagesClient />
    </PatientAppShell>
  );
}
