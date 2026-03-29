"use client";

import type { AppointmentSummary } from "@/modules/appointments/service";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isSafeExternalHref } from "@/lib/url/isSafeExternalHref";
import { AppointmentStatusBadge } from "./AppointmentStatusBadge";

type Props = {
  appointments: AppointmentSummary[];
};

/** Единый TooltipProvider для списка бейджей (без N вложенных провайдеров). */
export function CabinetUpcomingAppointments({ appointments }: Props) {
  if (appointments.length === 0) {
    return <p className="text-muted-foreground text-sm">Нет предстоящих приёмов.</p>;
  }

  return (
    <TooltipProvider>
      <ul className="flex flex-col gap-2">
        {appointments.map((a) => {
          const timeContent =
            a.link && isSafeExternalHref(a.link) ? (
              <a
                href={a.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-medium underline-offset-2 hover:underline"
              >
                {a.timeLabel}
              </a>
            ) : (
              <span className="font-medium tabular-nums">{a.timeLabel}</span>
            );
          return (
            <li
              key={a.id}
              className="border-border/80 bg-card grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg border px-3 py-2"
            >
              <span className="min-w-0 text-left text-sm tabular-nums">{a.dateLabel}</span>
              <span className="min-w-0 shrink-0 text-center text-sm">{timeContent}</span>
              <span className="flex min-w-0 justify-end">
                <AppointmentStatusBadge
                  mode="upcoming"
                  status={a.status}
                  cancelReason={a.cancelReason}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </TooltipProvider>
  );
}
