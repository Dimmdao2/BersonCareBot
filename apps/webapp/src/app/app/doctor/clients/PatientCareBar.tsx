"use client";

import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ClientIdentity } from "@/modules/doctor-clients/ports";
import type { AppointmentSummary } from "@/modules/appointments/service";
import { phoneToTelHref } from "@/shared/lib/phoneLinks";
import { cn } from "@/lib/utils";
import { DoctorClientSupportCareBar } from "./DoctorClientSupportCareBar";

type PatientCareBarProps = {
  identity: ClientIdentity;
  firstUpcoming: AppointmentSummary | undefined;
  chatUnreadCount: number;
  onOpenChat: () => void;
  onNavigateAnchor: (anchorId: string) => void;
};

export function PatientCareBar({
  identity,
  firstUpcoming,
  chatUnreadCount,
  onOpenChat,
  onNavigateAnchor,
}: PatientCareBarProps) {
  const tel = phoneToTelHref(identity.phone);
  const displayHeading =
    identity.displayName?.trim() !== "" ? identity.displayName.trim() : "Имя не указано";

  return (
    <header
      className={cn(
        "z-10 border-b border-border bg-card px-4 py-3",
        "md:sticky md:top-[var(--doctor-sticky-offset,0px)]",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p id="doctor-client-display-name" className="min-w-0 text-base font-semibold text-foreground">
                {displayHeading}
              </p>
              {identity.isArchived ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  Архив
                </span>
              ) : null}
              {identity.isBlocked ? (
                <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                  Блок
                </span>
              ) : null}
            </div>
            {tel ? (
              <p className="text-sm">
                <a href={tel} className="font-medium text-primary underline">
                  {identity.phone}
                </a>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Телефон не указан</p>
            )}
          </div>

          <div className="min-w-0 text-sm md:max-w-[40%] md:text-center">
            {firstUpcoming ? (
              <>
                {firstUpcoming.scheduleProvenancePrefix ? (
                  <p className="mb-0.5 text-xs text-muted-foreground">{firstUpcoming.scheduleProvenancePrefix}</p>
                ) : null}
                {firstUpcoming.link && /^https?:\/\//i.test(firstUpcoming.link) ? (
                  <a
                    href={firstUpcoming.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    {firstUpcoming.label}
                  </a>
                ) : (
                  <span>{firstUpcoming.label}</span>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Нет ближайших записей</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
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
                <span className="ml-1.5 rounded-full bg-primary-foreground px-1.5 py-0.5 text-[10px] font-semibold text-primary">
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

        <div className="flex flex-wrap items-center gap-3 sm:hidden">
          <DoctorClientSupportCareBar patientUserId={identity.userId} />
        </div>
      </div>
    </header>
  );
}
