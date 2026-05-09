"use client";

import Link from "next/link";
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
  return (
    <div
      className={cn(
        patientSurfaceInfoClass,
        "mb-4 flex flex-col gap-2 border-[#fef3c7] bg-[linear-gradient(135deg,#fff9f0_0%,#fff6e8_48%,#fffbeb_100%)] text-[var(--patient-text-primary)]",
      )}
    >
      <h2 className={patientSectionTitleNormalClass}>Напоминания сегодня</h2>
      <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">
        Программа реабилитации: {rehabTodayLine}
      </p>
      {warmupTodayLine != null ? (
        <p className="text-xs font-normal leading-snug text-[var(--patient-color-primary)]">Разминки: {warmupTodayLine}</p>
      ) : null}
      <Link
        href={remindersHref}
        className={cn(patientButtonWarningOutlineClass, "mt-2 min-h-8 w-fit self-end px-2.5 text-xs font-medium")}
      >
        Настроить расписание
      </Link>
    </div>
  );
}
