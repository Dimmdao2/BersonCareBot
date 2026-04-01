/**
 * Страница «Мои записи» (`/app/patient/cabinet`): native booking flow + активные и прошедшие приёмы.
 */

import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getOptionalPatientSession } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import { CabinetGuestAccess, patientHasPhoneOrMessenger } from "@/shared/ui/patient/guestAccess";
import { AppShell } from "@/shared/ui/AppShell";
import { CabinetActiveBookings } from "./CabinetActiveBookings";
import { CabinetInfoLinks } from "./CabinetInfoLinks";
import { CabinetBookingEntry } from "./CabinetBookingEntry";
import { mergePastBookingHistory } from "./cabinetPastBookingsMerge";
import { CabinetPastBookings } from "./CabinetPastBookings";

export default async function PatientCabinetPage() {
  const session = await getOptionalPatientSession();

  if (!session || !patientHasPhoneOrMessenger(session)) {
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

  const deps = buildAppDeps();
  const records = await deps.patientBooking.listMyBookings(session.user.userId);
  const projectionPast = await deps.patientCabinet.getPastAppointments(session.user.userId);
  const pastItems = mergePastBookingHistory(records.history, projectionPast);

  return (
    <AppShell
      title="Мои приёмы"
      user={session.user}
      backHref={routePaths.patient}
      backLabel="Меню"
      variant="patient"
    >
      <section className="flex flex-col gap-6">
        <CabinetActiveBookings bookings={records.upcoming} />
        <CabinetInfoLinks />
        <CabinetBookingEntry
          defaultName={session.user.displayName}
          defaultPhone={session.user.phone ?? ""}
        />
        <CabinetPastBookings items={pastItems} />
      </section>
    </AppShell>
  );
}
