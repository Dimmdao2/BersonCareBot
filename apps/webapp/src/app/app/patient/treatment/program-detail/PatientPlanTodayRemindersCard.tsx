"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Bell, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { NAV_STRIP_ICON_STROKE } from "@/shared/ui/navChrome";
import { patientButtonWarningOutlineClass } from "@/shared/ui/patientVisual";

const scheduleCardChrome = cn(
  "overflow-visible rounded-[var(--patient-card-radius-mobile)] md:rounded-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
  "border border-[#fef3c7] bg-[linear-gradient(135deg,#fff9f0_0%,#fff6e8_48%,#fffbeb_100%)]",
  "text-[var(--patient-text-primary)]",
);

/** Продолжение хром подписи карточки при раскрытии (полная ширина колонки страницы). */
const scheduleExpandedPanelClass = cn(
  "border-x border-b border-[#fef3c7] bg-[linear-gradient(180deg,#fffbf5_0%,#fff9f0_55%,#fff6ea_100%)]",
  "rounded-b-[var(--patient-card-radius-mobile)] md:rounded-b-[var(--patient-card-radius-desktop)]",
  "shadow-[var(--patient-shadow-card-mobile)] md:shadow-[var(--patient-shadow-card-desktop)]",
  "border-t border-[#fde68a]/50",
);

export type PatientPlanTodayRemindersCardProps = {
  rehabTodayLine: string;
  warmupTodayLine: string | null;
  remindersHref: string;
  /** Узкая кнопка/ссылка в одну строку с триггером (напр. поддержка); корень блока занимает ширину колонки страницы. */
  trailingAccessory?: ReactNode;
  /** Начальное состояние раскрытия (дневник — развёрнуто). */
  defaultOpen?: boolean;
};

export function PatientPlanTodayRemindersCard({
  rehabTodayLine,
  warmupTodayLine,
  remindersHref,
  trailingAccessory,
  defaultOpen = false,
}: PatientPlanTodayRemindersCardProps) {
  const [scheduleOpen, setScheduleOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={scheduleOpen}
      onOpenChange={setScheduleOpen}
      className="flex min-w-0 w-full flex-col gap-0"
    >
      <div
        className={cn(
          "flex min-w-0 w-full",
          trailingAccessory ? "flex-row items-start gap-2" : "",
        )}
      >
        <CollapsibleTrigger
          type="button"
          className={cn(
            scheduleCardChrome,
            "flex min-h-0 min-w-0 items-center justify-between gap-2 px-3 py-2 text-left outline-none",
            trailingAccessory ? "flex-1" : "w-full",
            "ring-offset-background focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
            scheduleOpen && "rounded-b-none border-b-transparent shadow-none",
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Bell
              className="size-[18px] shrink-0 text-[var(--patient-color-primary)]"
              strokeWidth={NAV_STRIP_ICON_STROKE}
              aria-hidden
            />
            <h2 className="m-0 min-w-0 truncate text-sm font-medium leading-tight text-[var(--patient-block-heading)]">
              Расписание
            </h2>
          </span>
          <ChevronDown
            className="size-3.5 shrink-0 text-[var(--patient-color-primary)] transition-transform group-data-[open]/collapsible:rotate-180"
            aria-hidden
          />
        </CollapsibleTrigger>
        {trailingAccessory ?? null}
      </div>
      <CollapsibleContent className="outline-none">
        <div className={cn(scheduleExpandedPanelClass, "px-3 py-3 md:px-3.5")}>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">
                Тренировки: {rehabTodayLine}
              </p>
              {warmupTodayLine != null ? (
                <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">
                  Разминки: {warmupTodayLine}
                </p>
              ) : null}
            </div>
            <Link
              href={remindersHref}
              prefetch={false}
              className={cn(
                patientButtonWarningOutlineClass,
                "min-h-8 w-auto shrink-0 self-center px-2.5 text-xs font-normal",
              )}
            >
              Настроить расписание
            </Link>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
