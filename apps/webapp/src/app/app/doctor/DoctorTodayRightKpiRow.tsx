"use client";

import Link from "next/link";
import { useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { AppointmentKpiItem } from "@/shared/ui/doctor/AppointmentKpiItem";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
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
        renderItem={(item) => (
          <AppointmentKpiItem
            item={{
              clientLabel: item.clientLabel,
              time: item.time,
              typeLabel: item.type,
              statusLabel: item.status,
              branchName: item.branchName,
              altNameNote: item.rubitimeNameIfDifferent
                ? `Имя в Rubitime: ${item.rubitimeNameIfDifferent}`
                : null,
              cancelled: isCancelledItem(item),
              href: item.href,
              ctaLabel: item.ctaLabel,
            }}
          />
        )}
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
        renderItem={(item) => (
          <AppointmentKpiItem
            item={{
              clientLabel: item.clientLabel,
              time: item.time,
              typeLabel: item.type,
              statusLabel: item.status,
              branchName: item.branchName,
              altNameNote: item.rubitimeNameIfDifferent
                ? `Имя в Rubitime: ${item.rubitimeNameIfDifferent}`
                : null,
              cancelled: isCancelledItem(item),
              href: item.href,
              ctaLabel: item.ctaLabel,
            }}
          />
        )}
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
        renderItem={(item) => (
          <AppointmentKpiItem
            item={{
              clientLabel: item.clientLabel,
              time: item.time,
              typeLabel: item.type,
              statusLabel: item.status,
              branchName: item.branchName,
              altNameNote: item.rubitimeNameIfDifferent
                ? `Имя в Rubitime: ${item.rubitimeNameIfDifferent}`
                : null,
              cancelled: isCancelledItem(item),
              href: item.href,
              ctaLabel: item.ctaLabel,
            }}
          />
        )}
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
