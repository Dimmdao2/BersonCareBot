"use client";

/**
 * PatientTabProgram — порт существующего UI программы лечения as-is.
 *
 * Решение (embed vs link):
 *  PatientTreatmentProgramsPanel — чистый client-компонент, принимает только
 *  patientUserId + templates; сам делает fetch списка инстансов через
 *  /api/doctor/clients/:userId/treatment-program-instances. Встраиваем напрямую.
 *
 *  Более богатый вид (inbox, дерево активной программы, тесты на оценку) живёт в
 *  /app/doctor/clients/:userId — добавляем secondary CTA «Открыть полный вид».
 *  // TODO(port): при расширении PatientTabProgram добавить DoctorClientActiveProgramPanel
 *  // и DoctorClientProgramInbox (клиентский fetch их данных).
 *
 * Active-program auto-navigation:
 *  On mount we fetch the instance list. If an active (non-completed) instance
 *  exists we immediately navigate to its editor page so the doctor lands directly
 *  on the active program instead of the list. The list panel is shown while the
 *  check is in-flight; it is only bypassed when an active instance is confirmed.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import type { TreatmentProgramInstanceSummary } from "@/modules/treatment-program/types";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";
import { PatientProgramPanelLoader } from "./program/PatientProgramPanelLoader";
import { ProgramHistoryModal } from "./program/ProgramHistoryModal";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabProgram({ userId, header: _header }: Props) {
  const router = useRouter();
  const [historyOpen, setHistoryOpen] = useState(false);
  const fullProgramHref = `/app/doctor/clients/${encodeURIComponent(userId)}?scope=appointments#doctor-client-section-treatment-programs`;

  // Auto-navigate to active program instance if one exists.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/doctor/clients/${encodeURIComponent(userId)}/treatment-program-instances`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; items?: TreatmentProgramInstanceSummary[] }) => {
        if (cancelled) return;
        if (data.ok && Array.isArray(data.items)) {
          const active = data.items.find((i) => i.status !== "completed");
          if (active) {
            router.push(
              `/app/doctor/clients/${encodeURIComponent(userId)}/treatment-programs/${encodeURIComponent(active.id)}`,
            );
          }
        }
      })
      .catch(() => {
        // Silently ignore — fall through to list panel below.
      });
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  return (
    <div className={cn(doctorSectionCardClass, "gap-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={doctorSectionTitleClass}>Программа лечения</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setHistoryOpen(true)}
          >
            История программ
          </Button>
          <Link
            href={fullProgramHref}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}
          >
            Полный вид →
          </Link>
        </div>
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
