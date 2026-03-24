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
    return <p className="text-muted-foreground text-sm">У вас нет активных записей.</p>;
  }

  return (
    <TooltipProvider>
      <ul className="flex flex-col gap-2">
        {appointments.map((a) => (
          <li
            key={a.id}
            className="border-border/80 bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              {a.link && isSafeExternalHref(a.link) ? (
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-medium underline-offset-2 hover:underline"
                >
                  {a.label}
                </a>
              ) : (
                <span className="font-medium">{a.label}</span>
              )}
            </div>
            <AppointmentStatusBadge status={a.status} cancelReason={a.cancelReason} />
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
