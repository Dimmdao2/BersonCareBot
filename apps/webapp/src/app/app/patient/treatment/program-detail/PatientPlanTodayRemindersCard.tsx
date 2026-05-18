"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  patientButtonWarningOutlineClass,
  patientSectionTitleNormalClass,
  patientSurfaceInfoClass,
} from "@/shared/ui/patientVisual";

export type PatientPlanTodayRemindersCardProps = {
  rehabTodayLine: string;
  warmupTodayLine: string | null;
  remindersHref: string;
};

export function PatientPlanTodayRemindersCard({
  rehabTodayLine,
  warmupTodayLine,
  remindersHref,
}: PatientPlanTodayRemindersCardProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <Collapsible
      open={scheduleOpen}
      onOpenChange={setScheduleOpen}
      className={cn(
        patientSurfaceInfoClass,
        "group/collapsible flex flex-col gap-0 border-[#fef3c7] bg-[linear-gradient(135deg,#fff9f0_0%,#fff6e8_48%,#fffbeb_100%)] text-[var(--patient-text-primary)]",
      )}
    >
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full min-h-10 items-center justify-between gap-2 px-3 py-2.5 text-left outline-none",
          "ring-offset-background focus-visible:ring-2 focus-visible:ring-[var(--patient-border)] focus-visible:ring-offset-2",
        )}
      >
        <h2 className={cn(patientSectionTitleNormalClass, "m-0")}>Напоминания на сегодня</h2>
        <ChevronDown
          className="size-4 shrink-0 text-[var(--patient-color-primary)] transition-transform group-data-[open]/collapsible:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 px-3 pb-3 pt-0">
        <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">
          Тренировки: {rehabTodayLine}
        </p>
        {warmupTodayLine != null ? (
          <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">
            Разминки: {warmupTodayLine}
          </p>
        ) : null}
        <Link
          href={remindersHref}
          className={cn(patientButtonWarningOutlineClass, "min-h-8 w-fit self-end px-2.5 text-xs font-medium")}
        >
          Настроить расписание
        </Link>
      </CollapsibleContent>
    </Collapsible>
  );
}
