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
 */

import { useState } from "react";
import Link from "next/link";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const fullProgramHref = `/app/doctor/clients/${encodeURIComponent(userId)}?scope=appointments#doctor-client-section-treatment-programs`;

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
