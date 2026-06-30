"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { DoctorMetricList } from "@/shared/ui/doctor/DoctorMetricList";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";
import { AppointmentKpiItem } from "@/shared/ui/doctor/AppointmentKpiItem";
import {
  doctorInlineLinkClass,
  doctorMetricLabelClass,
  doctorMetricValueClass,
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

type AppointmentModalState =
  | { kind: "today"; title: string; count: number; items: TodayAppointmentItem[] }
  | { kind: "week"; title: string; count: number; items: TodayAppointmentItem[] }
  | { kind: "month"; title: string; count: number; items: TodayAppointmentItem[] }
  | null;

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

function futureAppointmentItems(items: TodayAppointmentItem[]): TodayAppointmentItem[] {
  const now = Date.now();
  return items.filter((item) => {
    if (isCancelledItem(item) || !item.recordAtIso) return false;
    const ts = new Date(item.recordAtIso).getTime();
    return Number.isFinite(ts) && ts > now;
  });
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
  onTotalClick: () => void;
  onFutureClick: () => void;
};

function SplitAppointmentStatCard({
  id,
  title,
  total,
  future,
  onTotalClick,
  onFutureClick,
}: SplitAppointmentStatCardProps) {
  const segmentClass =
    "min-w-0 rounded-md px-2 py-1 text-left transition-colors enabled:hover:bg-muted/55 disabled:cursor-default disabled:opacity-55";

  return (
    <article id={id} className={doctorStatCardShellClass}>
      <p className={doctorMetricLabelClass}>{title}</p>
      <div className="mt-1 grid grid-cols-2 divide-x divide-border/70">
        <button
          type="button"
          className={cn(segmentClass, "pr-3")}
          onClick={onTotalClick}
          disabled={total <= 0}
          aria-label={`${title}: всего ${total}`}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={doctorMetricValueClass}>{total}</span>
            <span className="text-[10px] leading-none text-muted-foreground">Всего</span>
          </div>
        </button>
        <button
          type="button"
          className={cn(segmentClass, "pl-3")}
          onClick={onFutureClick}
          disabled={future <= 0}
          aria-label={`${title}: будущие ${future}`}
        >
          <div className="flex items-baseline gap-1.5">
            <span className={doctorMetricValueClass}>{future}</span>
            <span className="text-[10px] leading-none text-muted-foreground">Будущие</span>
          </div>
        </button>
      </div>
    </article>
  );
}

function renderAppointmentItem(item: TodayAppointmentItem): ReactNode {
  return (
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
  const [openModal, setOpenModal] = useState<AppointmentModalState>(null);

  const todayItems = todayAppointments ?? [];
  const weekItems = weekAppointments ?? [];
  const monthItems = monthAppointments ?? [];
  const weekFutureItems = futureAppointmentItems(weekItems);
  const monthFutureItems = futureAppointmentItems(monthItems);
  const weekFutureCount = weekFutureItems.length;
  const monthFutureCount = monthFutureItems.length;
  const monthTitle = `Записи ${currentMonthName(displayIana)}`;

  const openIfNotEmpty = (state: Exclude<AppointmentModalState, null>) => {
    if (state.count > 0) setOpenModal(state);
  };

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
          onClick={
            appointmentsTodayCount > 0
              ? () =>
                  openIfNotEmpty({
                    kind: "today",
                    title: "Записи сегодня",
                    count: appointmentsTodayCount,
                    items: todayItems,
                  })
              : undefined
          }
        />
        <SplitAppointmentStatCard
          id="doctor-today-right-kpi-week"
          title="Записи неделя"
          total={weekAppointmentsCount}
          future={weekFutureCount}
          onTotalClick={() =>
            openIfNotEmpty({
              kind: "week",
              title: "Все записи на неделе",
              count: weekAppointmentsCount,
              items: weekItems,
            })
          }
          onFutureClick={() =>
            openIfNotEmpty({
              kind: "week",
              title: "Будущие записи на неделе",
              count: weekFutureCount,
              items: weekFutureItems,
            })
          }
        />
        <SplitAppointmentStatCard
          id="doctor-today-right-kpi-month"
          title={monthTitle}
          total={monthAppointmentCount}
          future={monthFutureCount}
          onTotalClick={() =>
            openIfNotEmpty({
              kind: "month",
              title: `Все записи за ${currentMonthName(displayIana)}`,
              count: monthAppointmentCount,
              items: monthItems,
            })
          }
          onFutureClick={() =>
            openIfNotEmpty({
              kind: "month",
              title: `Будущие записи за ${currentMonthName(displayIana)}`,
              count: monthFutureCount,
              items: monthFutureItems,
            })
          }
        />
      </DoctorMetricList>

      <KpiPreviewModal<TodayAppointmentItem>
        open={openModal !== null}
        onClose={() => setOpenModal(null)}
        title={openModal?.title ?? ""}
        count={openModal?.count ?? 0}
        items={openModal?.items ?? []}
        renderItem={renderAppointmentItem}
        emptyState={
          <p className="py-4 text-center text-sm text-muted-foreground">
            Записей нет.{" "}
            <Link href={SCHEDULE_HREF} className={doctorInlineLinkClass}>
              Открыть расписание
            </Link>
          </p>
        }
      />
    </>
  );
}
