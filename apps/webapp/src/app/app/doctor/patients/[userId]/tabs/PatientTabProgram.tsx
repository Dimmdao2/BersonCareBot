"use client";

import { useState } from "react";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { PatientProgramPanelLoader } from "./program/PatientProgramPanelLoader";
import { ProgramHistoryModal } from "./program/ProgramHistoryModal";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabProgram({ userId, header: _header }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className={cn(doctorSectionCardClass, "gap-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={doctorSectionTitleClass}>Программа лечения</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => setHistoryOpen(true)}
        >
          История программ
        </Button>
      </div>

      <PatientProgramPanelLoader userId={userId} />

      <ProgramHistoryModal
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        userId={userId}
      />
    </div>
  );
}
