"use client";

import type { AppointmentRecordStatus } from "@/modules/appointments/service";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  status: AppointmentRecordStatus;
  cancelReason?: string | null;
  /** Предстоящие: зелёный «Записан» для активных; в истории плашки только у отмены и переноса. */
  mode?: "upcoming" | "history";
};

const LABEL: Record<AppointmentRecordStatus, string> = {
  created: "Создана",
  confirmed: "Подтверждён",
  rescheduled: "Перенос",
  cancelled: "Отменён",
};

/**
 * Бейдж статуса. Для tooltip при отмене — обёрнут в `TooltipProvider` родителем (см. `CabinetUpcomingAppointments`).
 */
export function AppointmentStatusBadge({ status, cancelReason, mode = "upcoming" }: Props) {
  if (mode === "history" && status !== "cancelled" && status !== "rescheduled") {
    return null;
  }

  const isUpcomingBooked = mode === "upcoming" && (status === "created" || status === "confirmed");
  const displayLabel = isUpcomingBooked ? "Записан" : LABEL[status];

  const toneClass = isUpcomingBooked
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100"
    : status === "cancelled"
      ? "border-destructive/30 bg-destructive/15 text-destructive"
      : status === "rescheduled"
        ? "border-purple-500/40 bg-purple-500/10 text-purple-800 dark:text-purple-200"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";

  const inner = (
    <Badge variant="outline" className={cn("h-auto rounded-full px-2 py-0.5 font-medium", toneClass)}>
      {displayLabel}
    </Badge>
  );

  if (status === "cancelled" && cancelReason?.trim()) {
    return (
      <Tooltip>
        <TooltipTrigger className="inline-flex cursor-help border-0 bg-transparent p-0">
          {inner}
        </TooltipTrigger>
        <TooltipContent>{cancelReason}</TooltipContent>
      </Tooltip>
    );
  }

  return inner;
}
