import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";

type Props = {
  appointmentsTodayCount: number;
  weekAppointmentsCount: number;
  monthAppointmentCount: number;
};

const SCHEDULE_HREF = "/app/doctor/schedule?tab=calendar";

export function DoctorTodayRightKpiRow({
  appointmentsTodayCount,
  weekAppointmentsCount,
  monthAppointmentCount,
}: Props) {
  return (
    <DoctorMetricList
      id="doctor-today-right-kpi"
      aria-label="Записи"
      className="grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3"
    >
      <DoctorStatCard
        id="doctor-today-right-kpi-today"
        title="Сегодня"
        value={appointmentsTodayCount}
        href={SCHEDULE_HREF}
      />
      <DoctorStatCard
        id="doctor-today-right-kpi-week"
        title="Неделя"
        value={weekAppointmentsCount}
        href={SCHEDULE_HREF}
      />
      <DoctorStatCard
        id="doctor-today-right-kpi-month"
        title="Месяц"
        value={monthAppointmentCount}
        href={SCHEDULE_HREF}
      />
    </DoctorMetricList>
  );
}
