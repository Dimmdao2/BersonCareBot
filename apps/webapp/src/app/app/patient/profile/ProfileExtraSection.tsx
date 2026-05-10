"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { routePaths } from "@/app-layer/routes/paths";
import { cn } from "@/lib/utils";
import { shareCabinetLink } from "@/shared/lib/shareCabinetLink";
import {
  patientCardClass,
  patientHeroBookingGradientFillClass,
  patientInfoLinkTileClass,
  patientSectionTitleClass,
} from "@/shared/ui/patientVisual";
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
          patientHeroBookingGradientFillClass,
        )}
      >
        <PatientCalendarTimezoneSection />
        <Link
          href={routePaths.patientInstall}
          className={cn(patientInfoLinkTileClass, "flex items-center justify-between min-h-11")}
        >
          <span>Установить как приложение</span>
          <ChevronRight className="size-4 shrink-0 text-[var(--patient-text-muted)]" aria-hidden />
        </Link>
        <Button variant="outline" size="sm" className="w-fit" type="button" onClick={() => void shareCabinetLink()}>
          Поделиться с другом
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
