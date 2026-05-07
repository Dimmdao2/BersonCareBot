/**
 * Legacy `/app/patient/cabinet`: для авторизованных пациентов редирект на объединённый экран записи.
 */

import { redirect } from "next/navigation";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { CabinetGuestAccess } from "@/shared/ui/patient/guestAccess";
import { AppShell } from "@/shared/ui/AppShell";

export const dynamic = "force-dynamic";

export default async function PatientCabinetPage() {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.cabinet);

  if (dataGate === "guest") {
    return (
      <AppShell
        title="Запись"
        user={session?.user ?? null}
        backHref={routePaths.patient}
        backLabel="Меню"
        variant="patient"
      >
        <CabinetGuestAccess session={session} />
      </AppShell>
    );
  }

  redirect(routePaths.bookingNew);
}
