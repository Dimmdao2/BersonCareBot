/**
 * Страница «Мои записи» (`/app/patient/cabinet`): native booking flow + активные и прошедшие приёмы.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession, patientRscPersonalDataGate } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { CabinetGuestAccess } from "@/shared/ui/patient/guestAccess";
import { AppShell } from "@/shared/ui/AppShell";
import { patientInnerPageStackClass } from "@/shared/ui/patientVisual";
import { CabinetActiveBookings } from "./CabinetActiveBookings";
import { CabinetInfoLinks } from "./CabinetInfoLinks";
import { CabinetBookingEntry } from "./CabinetBookingEntry";
import { mergePastBookingHistory } from "./cabinetPastBookingsMerge";
import { CabinetPastBookings } from "./CabinetPastBookings";
import { CabinetIntakeHistory } from "./CabinetIntakeHistory";
import { getOnlineIntakeService } from "@/app-layer/di/onlineIntakeDeps";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export const dynamic = "force-dynamic";

export default async function PatientCabinetPage() {
  const session = await getOptionalPatientSession();
  const dataGate = await patientRscPersonalDataGate(session, routePaths.cabinet);

  if (dataGate === "guest") {
    return (
      <AppShell
        title="Мои приёмы"
        user={session?.user ?? null}
        backHref={routePaths.patient}
        backLabel="Меню"
        variant="patient"
      >
        <CabinetGuestAccess session={session} />
      </AppShell>
    );
  }

  const s = session!;
  const deps = buildAppDeps();
  const records = await deps.patientBooking.listMyBookings(s.user.userId);
  const projectionPast = await deps.patientCabinet.getPastAppointments(s.user.userId);
  const pastItems = mergePastBookingHistory(records.history, projectionPast);

  const intakeService = getOnlineIntakeService();
  const intakeResult = await intakeService.listMyRequests({ userId: s.user.userId, limit: 10 }).catch(() => ({ items: [] }));
  const appDisplayTimeZone = await getAppDisplayTimeZone();

  return (
    <AppShell
      title="Мои приёмы"
      user={s.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className={patientInnerPageStackClass}>
        <CabinetActiveBookings bookings={records.upcoming} appDisplayTimeZone={appDisplayTimeZone} />
        <CabinetInfoLinks />
        <CabinetBookingEntry />
        <CabinetIntakeHistory items={intakeResult.items} />
        <CabinetPastBookings items={pastItems} appDisplayTimeZone={appDisplayTimeZone} />
      </section>
    </AppShell>
  );
}
