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
  initialProgramInstances?: TreatmentProgramInstanceSummary[] | null;
};

export function PatientTabProgram({ userId, header: _header, active, initialProgramInstances }: Props) {
  const router = useRouter();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [programCheckDone, setProgramCheckDone] = useState(false);

  const programHref = (instanceId: string) =>
    `/app/doctor/patients/${encodeURIComponent(userId)}/programs/${encodeURIComponent(instanceId)}`;

  // PROG-50: warm the (heavy, library-fetching) program-editor route as soon as we know the
  // active instance — even while this tab is still CSS-hidden — so the eventual tab-click
  // navigation is near-instant instead of showing a «Загрузка программы…» wait.
  const knownActiveInstanceId =
    initialProgramInstances?.find((i) => i.status !== "completed")?.id ?? null;
  useEffect(() => {
    if (knownActiveInstanceId) router.prefetch(programHref(knownActiveInstanceId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownActiveInstanceId, userId]);

  // PROG-01: if active program exists, navigate directly to its editor.
  // Guard: only trigger when this tab is actually visible — without this guard the
  // component mounts (even when CSS-hidden) and fires router.push unconditionally.
  useEffect(() => {
    if (!active) return;
    if (initialProgramInstances != null) {
      const activeInstance = initialProgramInstances.find((i) => i.status !== "completed");
      if (activeInstance) {
        router.push(programHref(activeInstance.id));
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync completion of SSR-data path: no program found in preloaded data
      setProgramCheckDone(true);
      return;
    }
    let cancelled = false;
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          const activeInst = data.items.find((i) => i.status !== "completed");
          if (activeInst) {
            router.push(programHref(activeInst.id));
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
  }, [userId, router, active, initialProgramInstances]);

  if (!programCheckDone) {
    // Skeleton mirroring the editor (toolbar + stage cards) — shown only briefly while the
    // prefetched program route resolves; reads as intentional rather than a bare loading line.
    return (
      <div className={cn(doctorSectionCardClass, "gap-3")} aria-busy="true">
        <div className="flex items-center justify-between gap-2">
          <div className="h-5 w-44 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-16 animate-pulse rounded-lg bg-muted/70" />
        <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
        <div className="h-16 animate-pulse rounded-lg bg-muted/50" />
        <span className="sr-only">Загрузка программы…</span>
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
