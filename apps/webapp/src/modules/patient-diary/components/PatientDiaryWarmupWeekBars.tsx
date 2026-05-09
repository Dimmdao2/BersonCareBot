import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import type { DiaryWarmupDayModel } from "@/modules/patient-diary/loadPatientDiaryWeekActivity";

export type PatientDiaryWarmupWeekBarsProps = {
  weekDayLabels: string[];
  days: DiaryWarmupDayModel[];
};

/** Недельные столбики разминок относительно слотов (см. `loadPatientDiaryWeekActivity`). */
export function PatientDiaryWarmupWeekBars({ weekDayLabels, days }: PatientDiaryWarmupWeekBarsProps) {
  return (
    <section
      id="patient-diary-warmup-week-section"
      className={cn(patientSectionSurfaceClass, "overflow-x-visible border-0 shadow-none")}
    >
      <h2 className={patientSectionTitleClass}>Разминки за неделю</h2>
      <div className="mt-3 grid min-h-[100px] w-full min-w-0 grid-cols-7 gap-1 sm:gap-2">
        {weekDayLabels.map((label, idx) => {
          const d = days[idx] ?? null;
          return (
            <div key={label} className="flex min-w-0 flex-col items-center gap-1">
              <span className={cn(patientMutedTextClass, "text-center text-[10px] leading-tight sm:text-xs")}>
                {label}
              </span>
              {d == null ?
                <div className="mt-auto h-16 w-full max-w-[2.5rem] rounded-sm bg-[var(--patient-border)]/50" aria-hidden />
              : <div className="relative mt-auto flex h-16 w-full max-w-[2.5rem] flex-col justify-end rounded-sm bg-[var(--patient-border)]/35">
                  {d.allDone ?
                    <span className="absolute -top-5 left-1/2 -translate-x-1/2" aria-label="Все слоты дня закрыты">
                      <Flame className="size-4 text-orange-500" strokeWidth={2} aria-hidden />
                    </span>
                  : null}
                  <div
                    className={cn(
                      "w-full rounded-sm transition-colors",
                      d.doneCount === 0 ? "bg-[var(--patient-border)]"
                      : "bg-[var(--patient-color-success)]/85",
                    )}
                    style={{
                      height: `${d.slotLimit > 0 ? Math.min(100, Math.round((d.doneCount / d.slotLimit) * 100)) : 0}%`,
                      minHeight: d.doneCount > 0 ? "4px" : undefined,
                    }}
                    aria-label={`${d.doneCount} из ${d.slotLimit}`}
                  />
                </div>
              }
            </div>
          );
        })}
      </div>
    </section>
  );
}
