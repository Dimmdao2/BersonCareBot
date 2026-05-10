"use client";

import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { patientCardClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import { PatientCalendarTimezoneSection } from "./PatientCalendarTimezoneSection";

export function ProfileExtraSection() {
  return (
    <Collapsible id="patient-profile-extra" defaultOpen={false} className={cn(patientCardClass, "!p-0 overflow-hidden")}>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-4 md:p-[18px] text-left">
        <span className={patientSectionTitleClass}>Дополнительно</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-[var(--patient-text-muted)] transition-transform duration-200",
            "group-data-[panel-open]:rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className={cn(
          "flex flex-col gap-4 border-t border-[var(--patient-border)]/50 px-4 pb-4 pt-4 md:px-[18px] md:pb-[18px]",
          "bg-[var(--patient-card-bg)]",
        )}
      >
        <PatientCalendarTimezoneSection />
      </CollapsibleContent>
    </Collapsible>
  );
}
