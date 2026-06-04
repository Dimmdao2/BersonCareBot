import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";
import { LfkIntakeClient } from "./LfkIntakeClient";

export default async function LfkIntakePage() {
  const session = await requirePatientAccessWithPhone(routePaths.intakeLfk);

  return (
    <PatientAppShell
      title="Онлайн-запрос"
      user={session.user}
      backHref={routePaths.bookingNew}
      backLabel="Назад"
     
    >
      <LfkIntakeClient />
    </PatientAppShell>
  );
}
