"use client";

import Link from "next/link";
import { useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { doctorInlineLinkClass, doctorSectionItemClass } from "@/shared/ui/doctor/doctorVisual";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";

type Props = {
  appointmentsTodayCount: number;
  weekAppointmentsCount: number;
  monthAppointmentCount: number;
  /** Appointments for today (for preview modal) */
  todayAppointments?: TodayAppointmentItem[];
  /** Appointments this week (for week modal) */
  weekAppointments?: TodayAppointmentItem[];
  /** Appointments this calendar month (for month modal) */
  monthAppointments?: TodayAppointmentItem[];
};

type ModalKind = "today" | "week" | "month";

const SCHEDULE_HREF = "/app/doctor/schedule?tab=calendar";

/** #9: statuses that represent a cancellation in the appointment lists. */
const CANCELLED_STATUS_VALUES = [
  "canceled",
  "cancelled_by_patient",
  "cancelled_by_specialist",
  "late_cancellation",
  "no_show",
];

function isCancelledItem(item: TodayAppointmentItem): boolean {
  return CANCELLED_STATUS_VALUES.some(
    (s) => item.status === s || item.status.toLowerCase().includes("отмен"),
  );
}

function AppointmentModalItem({ item }: { item: TodayAppointmentItem }) {
  const cancelled = isCancelledItem(item);
  return (
    <div className={cancelled ? "rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2" : doctorSectionItemClass}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={`font-medium ${cancelled ? "text-destructive/80 line-through" : "text-foreground"}`}>
          {item.clientLabel}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
      </div>
      {cancelled ? (
        <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-destructive">
          Отмена
        </p>
      ) : null}
      {item.rubitimeNameIfDifferent ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Имя в Rubitime: {item.rubitimeNameIfDifferent}
        </p>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[item.type, !cancelled ? item.status : null, item.branchName].filter(Boolean).join(" · ")}
      </p>
      {!cancelled ? (
        <p className="mt-2">
          <Link href={item.href} className={doctorInlineLinkClass}>
            {item.ctaLabel}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

export function DoctorTodayRightKpiRow({
  appointmentsTodayCount,
  weekAppointmentsCount,
  monthAppointmentCount,
  todayAppointments,
  weekAppointments,
  monthAppointments,
}: Props) {
  const [openModal, setOpenModal] = useState<ModalKind | null>(null);

  const todayItems = todayAppointments ?? [];
  const weekItems = weekAppointments ?? [];
  const monthItems = monthAppointments ?? [];

  return (
    <>
      <DoctorMetricList
        id="doctor-today-right-kpi"
        aria-label="Записи"
        className="grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3"
      >
        {/* Renamed: «Сегодня» → «Записи сегодня» */}
        <DoctorStatCard
          id="doctor-today-right-kpi-today"
          title="Записи сегодня"
          value={appointmentsTodayCount}
          onClick={() => setOpenModal("today")}
        />
        {/* Renamed: «Неделя» → «Записи неделя» */}
        <DoctorStatCard
          id="doctor-today-right-kpi-week"
          title="Записи неделя"
          value={weekAppointmentsCount}
          onClick={() => setOpenModal("week")}
        />
        {/* Renamed: «Месяц» → «Записи месяц» */}
        <DoctorStatCard
          id="doctor-today-right-kpi-month"
          title="Записи месяц"
          value={monthAppointmentCount}
          onClick={() => setOpenModal("month")}
        />
      </DoctorMetricList>

      {/* Modal: Записи сегодня — #8: patient-search removed */}
      <KpiPreviewModal<TodayAppointmentItem>
        open={openModal === "today"}
        onClose={() => setOpenModal(null)}
        title="Записи сегодня"
        count={appointmentsTodayCount}
        items={todayItems}
        renderItem={(item) => <AppointmentModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Записей на сегодня нет.{" "}
            <Link href={SCHEDULE_HREF} className={doctorInlineLinkClass}>
              Открыть расписание
            </Link>
          </p>
        }
      />

      {/* Modal: Записи неделя — #8: patient-search removed */}
      <KpiPreviewModal<TodayAppointmentItem>
        open={openModal === "week"}
        onClose={() => setOpenModal(null)}
        title="Записи на неделе"
        count={weekAppointmentsCount}
        items={weekItems}
        renderItem={(item) => <AppointmentModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Записей на этой неделе нет.{" "}
            <Link href={SCHEDULE_HREF} className={doctorInlineLinkClass}>
              Открыть расписание
            </Link>
          </p>
        }
      />

      {/* Modal: Записи месяц — #8: patient-search removed */}
      <KpiPreviewModal<TodayAppointmentItem>
        open={openModal === "month"}
        onClose={() => setOpenModal(null)}
        title="Записи в этом месяце"
        count={monthAppointmentCount}
        items={monthItems}
        renderItem={(item) => <AppointmentModalItem item={item} />}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Записей в этом месяце нет.{" "}
            <Link href={SCHEDULE_HREF} className={doctorInlineLinkClass}>
              Открыть расписание
            </Link>
          </p>
        }
      />
    </>
  );
}
