"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/doctor/primitives/dropdown-menu";
import type { ClientIdentity } from "@/modules/doctor-clients/ports";
import type { AppointmentSummary } from "@/modules/appointments/service";
import type { SpecialistTaskPatientSummary } from "@/modules/specialist-tasks/types";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { cn } from "@/lib/utils";
import { DoctorClientSupportCareBar } from "./DoctorClientSupportCareBar";
import {
  doctorClientDisplayNameClass,
  doctorClientEntityHeaderClass,
  doctorClientStatusPillDestructiveClass,
  doctorClientStatusPillMutedClass,
} from "./doctorClientCardChrome";
import { doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";

type PatientCareBarProps = {
  identity: ClientIdentity;
  firstUpcoming: AppointmentSummary | undefined;
  chatUnreadCount: number;
  onOpenChat: () => void;
  onNavigateAnchor: (anchorId: string) => void;
  taskSummary?: SpecialistTaskPatientSummary | null;
};

function UpcomingAppointment({ appointment }: { appointment: AppointmentSummary }) {
  return (
    <>
      {appointment.scheduleProvenancePrefix ? (
        <p className="mb-0.5 text-xs text-muted-foreground">{appointment.scheduleProvenancePrefix}</p>
      ) : null}
      {appointment.link && /^https?:\/\//i.test(appointment.link) ? (
        <a
          href={appointment.link}
          target="_blank"
          rel="noopener noreferrer"
          className={doctorInlineLinkClass}
        >
          {appointment.label}
        </a>
      ) : (
        <span className="font-medium text-foreground">{appointment.label}</span>
      )}
    </>
  );
}

export function PatientCareBar({
  identity,
  firstUpcoming,
  chatUnreadCount,
  onOpenChat,
  onNavigateAnchor,
  taskSummary,
}: PatientCareBarProps) {
  const tel = phoneToTelHref(identity.phone);
  const displayHeading =
    identity.displayName?.trim() !== "" ? identity.displayName.trim() : "Имя не указано";

  return (
    <header className={doctorClientEntityHeaderClass}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p id="doctor-client-display-name" className={doctorClientDisplayNameClass}>
                {displayHeading}
              </p>
              {identity.isArchived ? (
                <span className={doctorClientStatusPillMutedClass}>Архив</span>
              ) : null}
              {identity.isBlocked ? (
                <span className={doctorClientStatusPillDestructiveClass}>Блок</span>
              ) : null}
            </div>
            {tel ? (
              <p className="text-sm">
                <a href={tel} className={doctorInlineLinkClass}>
                  {identity.phone}
                </a>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Телефон не указан</p>
            )}
          </div>

          <div className="hidden min-w-0 max-w-[38%] text-center text-sm md:block">
            {firstUpcoming ? (
              <div>
                <p className="mb-0.5 text-xs text-muted-foreground">Ближайшая:</p>
                <UpcomingAppointment appointment={firstUpcoming} />
              </div>
            ) : (
              <p className="text-muted-foreground">Нет ближайших записей</p>
            )}
            {taskSummary && taskSummary.openCount > 0 ? (
              <button
                type="button"
                className={cn("mt-2 w-full text-left text-xs", doctorInlineLinkClass)}
                onClick={() => onNavigateAnchor("doctor-client-section-tasks")}
              >
                Задачи: {taskSummary.openCount} невып.
                {taskSummary.nextImportantOrOverdue?.isImportant ? " ❗" : ""}
                {taskSummary.nextImportantOrOverdue?.title
                  ? ` · ${taskSummary.nextImportantOrOverdue.title}`
                  : ""}
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="hidden sm:block">
              <DoctorClientSupportCareBar patientUserId={identity.userId} />
            </div>
            <Button
              type="button"
              size="sm"
              id="doctor-client-open-support-chat-button"
              onClick={onOpenChat}
            >
              Чат
              {chatUnreadCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                  {chatUnreadCount}
                </span>
              ) : null}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-muted"
                aria-label="Ещё"
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onNavigateAnchor("doctor-client-section-booking-history")}>
                  История
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateAnchor("doctor-client-section-notes")}>
                  Заметки
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateAnchor("doctor-client-section-treatment-programs")}>
                  Программа
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNavigateAnchor("doctor-client-section-contacts")}>
                  Учётка
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:hidden">
          <div className="min-w-0 text-sm">
            {firstUpcoming ? (
              <div>
                <p className="mb-0.5 text-xs text-muted-foreground">Ближайшая:</p>
                <UpcomingAppointment appointment={firstUpcoming} />
              </div>
            ) : (
              <p className="text-muted-foreground">Нет ближайших записей</p>
            )}
          </div>
          <DoctorClientSupportCareBar patientUserId={identity.userId} />
        </div>
        {taskSummary && taskSummary.openCount > 0 ? (
          <button
            type="button"
            className={cn("text-left text-sm md:hidden", doctorInlineLinkClass)}
            onClick={() => onNavigateAnchor("doctor-client-section-tasks")}
          >
            Задачи: {taskSummary.openCount} невып.
            {taskSummary.nextImportantOrOverdue?.title
              ? ` · ${taskSummary.nextImportantOrOverdue.title}`
              : ""}
          </button>
        ) : null}
      </div>
    </header>
  );
}
