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

import Link from "next/link";
import type { PatientCardHeader } from "@/modules/doctor-clients/ports";
import {
  doctorSectionCardClass,
  doctorSectionTitleClass,
} from "@/shared/ui/doctor/doctorVisual";
import { buttonVariants } from "@/shared/ui/doctor/primitives/button-variants";
import { cn } from "@/lib/utils";
import { PatientProgramPanelLoader } from "./program/PatientProgramPanelLoader";

type Props = {
  userId: string;
  header?: PatientCardHeader;
};

export function PatientTabProgram({ userId, header: _header }: Props) {
  const fullProgramHref = `/app/doctor/clients/${encodeURIComponent(userId)}?scope=appointments#doctor-client-section-treatment-programs`;

  return (
    <div className={cn(doctorSectionCardClass, "gap-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={doctorSectionTitleClass}>Программа лечения</p>
        <Link
          href={fullProgramHref}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs")}
        >
          Полный вид →
        </Link>
      </div>

      <PatientProgramPanelLoader userId={userId} />
    </div>
  );
}
