/**
 * Legacy `/app/patient/cabinet`: для авторизованных пациентов редирект на объединённый экран записи.
 */

import { redirect } from "next/navigation";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { CabinetGuestAccess } from "@/shared/ui/patient/guestAccess";
import { PatientAppShell } from "@/shared/ui/patient/PatientAppShell";

export const dynamic = "force-dynamic";

export default async function PatientCabinetPage() {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.cabinet);

  if (dataGate === "guest") {
    return (
      <PatientAppShell
        title="Запись"
        user={session?.user ?? null}
        backHref={routePaths.patient}
        backLabel="Меню"
       
      >
        <CabinetGuestAccess session={session} />
      </PatientAppShell>
    );
  }

  redirect(routePaths.bookingNew);
}
