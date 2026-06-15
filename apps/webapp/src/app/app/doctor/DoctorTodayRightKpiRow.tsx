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
};

type ModalKind = "today" | "week" | "month";

const SCHEDULE_HREF = "/app/doctor/schedule?tab=calendar";

function AppointmentModalItem({ item }: { item: TodayAppointmentItem }) {
  return (
    <div className={doctorSectionItemClass}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-medium text-foreground">{item.clientLabel}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
      </div>
      {item.rubitimeNameIfDifferent ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Имя в Rubitime: {item.rubitimeNameIfDifferent}
        </p>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground">
        {[item.type, item.status, item.branchName].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2">
        <Link href={item.href} className={doctorInlineLinkClass}>
          {item.ctaLabel}
        </Link>
      </p>
    </div>
  );
}

export function DoctorTodayRightKpiRow({
  appointmentsTodayCount,
  weekAppointmentsCount,
  monthAppointmentCount,
  todayAppointments,
}: Props) {
  const [openModal, setOpenModal] = useState<ModalKind | null>(null);

  const todayItems = todayAppointments ?? [];

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
          href={SCHEDULE_HREF}
        />
        {/* Renamed: «Месяц» → «Записи месяц» */}
        <DoctorStatCard
          id="doctor-today-right-kpi-month"
          title="Записи месяц"
          value={monthAppointmentCount}
          href={SCHEDULE_HREF}
        />
      </DoctorMetricList>

      {/* Modal: Записи сегодня */}
      <KpiPreviewModal<TodayAppointmentItem>
        open={openModal === "today"}
        onClose={() => setOpenModal(null)}
        title="Записи сегодня"
        count={appointmentsTodayCount}
        items={todayItems}
        renderItem={(item) => <AppointmentModalItem item={item} />}
        searchPlaceholder="Поиск по пациенту…"
        searchPredicate={(item, q) =>
          item.clientLabel.toLowerCase().includes(q.toLowerCase()) ||
          (item.rubitimeNameIfDifferent?.toLowerCase().includes(q.toLowerCase()) ?? false)
        }
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Записей на сегодня нет.{" "}
            <Link href={SCHEDULE_HREF} className={doctorInlineLinkClass}>
              Открыть расписание
            </Link>
          </p>
        }
      />
    </>
  );
}
