import type { PatientMoodWeekDay } from "@/modules/patient-mood/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  days: readonly PatientMoodWeekDay[];
};

/** Компактная полоса последних 7 локальных дней (оценка 1–5 или прочерк). */
export function PatientHomeWellbeingWeekStrip({ days }: Props) {
  if (days.length === 0) return null;
  return (
    <div
      className={cn("mt-2 flex justify-between gap-0.5 px-4 lg:px-0")}
      aria-label="Самочувствие за неделю"
    >
      {days.map((d) => (
        <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
          <span className={cn(patientMutedTextClass, "text-[10px] tabular-nums")}>{d.date.slice(5)}</span>
          <span className="text-sm font-medium tabular-nums text-foreground">{d.score ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}
