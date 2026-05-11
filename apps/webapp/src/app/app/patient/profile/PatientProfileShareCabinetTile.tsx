"use client";

import { ChevronRight } from "lucide-react";
import { shareCabinetLink } from "@/shared/lib/shareCabinetLink";
import { patientInfoLinkTileClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

/** Клиентская обёртка: нельзя вешать `onClick` на элементы из Server Component. */
export function PatientProfileShareCabinetTile() {
  return (
    <button
      type="button"
      className={cn(patientInfoLinkTileClass, "flex min-h-11 w-full items-center justify-between text-left")}
      onClick={() => void shareCabinetLink()}
    >
      <span>Поделиться с другом</span>
      <ChevronRight className="size-4 shrink-0 text-[var(--patient-text-muted)]" aria-hidden />
    </button>
  );
}
