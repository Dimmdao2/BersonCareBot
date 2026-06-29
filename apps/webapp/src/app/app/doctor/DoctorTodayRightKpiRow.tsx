"use client";

import Link from "next/link";
import { useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { AppointmentKpiItem } from "@/shared/ui/doctor/AppointmentKpiItem";
import {
  doctorInlineLinkClass,
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorStatCardInteractiveClass,
  doctorStatCardShellClass,
} from "@/shared/ui/doctor/doctorVisual";
import { DoctorStatCard } from "./analytics/clients/DoctorStatCard";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";
import { cn } from "@/lib/utils";

type Props = {
  appointmentsTodayCount: number;
  weekAppointmentsCount: number;
  monthAppointmentCount: number;
  displayIana: string;
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

function futureAppointmentsCount(items: TodayAppointmentItem[]): number {
  const now = Date.now();
  return items.filter((item) => {
    if (isCancelledItem(item) || !item.recordAtIso) return false;
    const ts = new Date(item.recordAtIso).getTime();
    return Number.isFinite(ts) && ts > now;
  }).length;
}

function currentMonthName(displayIana: string): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: displayIana }).format(
    new Date(),
  );
}

type SplitAppointmentStatCardProps = {
  id: string;
  title: string;
  total: number;
  future: number;
  onClick: () => void;
};

function SplitAppointmentStatCard({
  id,
  title,
  total,
  future,
  onClick,
}: SplitAppointmentStatCardProps) {
  return (
    <button
      id={id}
      type="button"
      className={cn(doctorStatCardShellClass, doctorStatCardInteractiveClass, "w-full text-left")}
      onClick={onClick}
      aria-label={`${title}: всего ${total}, будущие ${future}`}
    >
      <p className={doctorMetricLabelClass}>{title}</p>
      <div className="mt-1 grid grid-cols-2 divide-x divide-border/70">
        <div className="min-w-0 pr-2">
          <div className="flex items-baseline gap-1.5">
            <span className={doctorMetricValueClass}>{total}</span>
            <span className="text-[10px] leading-none text-muted-foreground">Всего</span>
          </div>
        </div>
        <div className="min-w-0 pl-2">
          <div className="flex items-baseline gap-1.5">
            <span className={doctorMetricValueClass}>{future}</span>
            <span className="text-[10px] leading-none text-muted-foreground">Будущие</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function DoctorTodayRightKpiRow({
  appointmentsTodayCount,
  weekAppointmentsCount,
  monthAppointmentCount,
  displayIana,
  todayAppointments,
  weekAppointments,
  monthAppointments,
}: Props) {
  const [openModal, setOpenModal] = useState<ModalKind | null>(null);

  const todayItems = todayAppointments ?? [];
  const weekItems = weekAppointments ?? [];
  const monthItems = monthAppointments ?? [];
  const weekFutureCount = futureAppointmentsCount(weekItems);
  const monthFutureCount = futureAppointmentsCount(monthItems);
  const monthTitle = `Записи ${currentMonthName(displayIana)}`;

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
        <SplitAppointmentStatCard
          id="doctor-today-right-kpi-week"
          title="Записи неделя"
          total={weekAppointmentsCount}
          future={weekFutureCount}
          onClick={() => setOpenModal("week")}
        />
        <SplitAppointmentStatCard
          id="doctor-today-right-kpi-month"
          title={monthTitle}
          total={monthAppointmentCount}
          future={monthFutureCount}
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
