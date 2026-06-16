"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import { PatientProgramPanelLoader } from "./program/PatientProgramPanelLoader";
import { ProgramHistoryModal } from "./program/ProgramHistoryModal";

type Props = {
  userId: string;
  header?: PatientCardHeader;
  active?: boolean;
};

export function PatientTabProgram({ userId, header: _header, active }: Props) {
  const router = useRouter();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [programCheckDone, setProgramCheckDone] = useState(false);

  // PROG-01: if active program exists, navigate directly to its editor.
  // Guard: only trigger when this tab is actually visible — without this guard the
  // component mounts (even when CSS-hidden) and fires router.push unconditionally.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          const active = data.items.find((i) => i.status !== "completed");
          if (active) {
            router.push(
              `/app/doctor/patients/${encodeURIComponent(userId)}/programs/${encodeURIComponent(active.id)}`,
            );
            return;
          }
        }
        setProgramCheckDone(true);
      })
      .catch(() => {
        if (!cancelled) setProgramCheckDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, router, active]);

  if (!programCheckDone) {
    return (
      <div className={cn(doctorSectionCardClass)}>
        <p className="text-sm text-muted-foreground">Загрузка программы…</p>
      </div>
    );
  }

  // PROG-12: no active program — show list/assign interface
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
