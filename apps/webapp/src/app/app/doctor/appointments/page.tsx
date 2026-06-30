/**
 * Рабочий экран «Записи» для специалиста.
 * tab=appointments (default): список записей по датам + переключатель будущие/архив.
 * tab=schedule: настройка рабочего расписания (только admin).
 */
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorAccess } from "@/app-layer/guards/requireRole";
import { DoctorAppShell } from "@/shared/ui/doctor/DoctorAppShell";
import { DoctorPageHeader } from "@/shared/ui/doctor/shell/DoctorPageHeader";
import { DoctorAppointmentsListClient } from "./DoctorAppointmentsListClient";
import { DoctorAppointmentsToolbar } from "./DoctorAppointmentsToolbar";
import { BookingScheduleBlocksSection } from "@/app/app/settings/BookingScheduleBlocksSection";
import { BookingScheduleSlotsProbeSection } from "@/app/app/settings/BookingScheduleSlotsProbeSection";
import { BookingSoloScheduleSection } from "@/app/app/settings/BookingSoloScheduleSection";

type Props = {
  searchParams: Promise<{ tab?: string; view?: string }>;
};

export default async function DoctorAppointmentsPage({ searchParams }: Props) {
  const session = await requireDoctorAccess();
  const params = await searchParams;
  const tab = params.tab === "schedule" ? "schedule" : "appointments";
  const view = params.view === "past" ? "past" : "future";
  const isAdmin = session.user.role === "admin";

  const deps = buildAppDeps();
  const appointments =
    tab === "appointments"
      ? await deps.doctorAppointments.listAppointmentsForSpecialist(
          view === "past" ? { kind: "past", limit: 50, offset: 0 } : { kind: "futureActive" },
        )
      : [];

  return (
    <DoctorAppShell title="Записи" user={session.user}>
      <DoctorPageHeader title="Записи" />
      <DoctorAppointmentsToolbar tab={tab} isAdmin={isAdmin} />

      {tab === "appointments" ? (
        <DoctorAppointmentsListClient
          appointments={appointments}
          view={view}
        />
      ) : isAdmin ? (
        <div className="flex flex-col gap-3">
          <BookingSoloScheduleSection />
          <BookingScheduleBlocksSection soloUx />
          <BookingScheduleSlotsProbeSection />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Управление расписанием доступно только администратору.
        </p>
      )}
    </DoctorAppShell>
  );
}
