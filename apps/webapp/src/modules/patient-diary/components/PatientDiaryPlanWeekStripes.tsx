import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientSectionSurfaceClass, patientSectionTitleClass } from "@/shared/ui/patientVisual";
import type { DiaryPlanDayModel } from "@/modules/patient-diary/loadPatientDiaryWeekActivity";

export type PatientDiaryPlanWeekStripesProps = {
  weekDayLabels: string[];
  days: DiaryPlanDayModel[];
};

/** Полоски выполнения элементов плана по дням недели (порядок как в чек-листе). */
export function PatientDiaryPlanWeekStripes({ weekDayLabels, days }: PatientDiaryPlanWeekStripesProps) {
  const maxItems = Math.max(1, ...days.map((d) => (d?.items.length ?? 0)));

  return (
    <section
      id="patient-diary-plan-week-section"
      className={cn(patientSectionSurfaceClass, "overflow-x-visible border-0 shadow-none")}
    >
      <h2 className={patientSectionTitleClass}>План за неделю</h2>
      <div
        className="mt-3 grid w-full min-w-0 gap-1 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(7, minmax(0, 1fr))`, minHeight: `${8 + maxItems * 6}px` }}
      >
        {weekDayLabels.map((label, idx) => {
          const d = days[idx] ?? null;
          const items = d?.items ?? [];
          return (
            <div key={label} className="flex min-w-0 flex-col items-stretch gap-1">
              <span className={cn(patientMutedTextClass, "text-center text-[10px] leading-tight sm:text-xs")}>
                {label}
              </span>
              <div className="flex min-h-[48px] flex-1 flex-col justify-end gap-0.5">
                {items.length === 0 ?
                  <div className="h-0.5 w-full rounded-full bg-[var(--patient-border)]/60" aria-hidden />
                : items.map((it) => (
                    <div
                      key={it.itemId}
                      className={cn(
                        "h-0.5 w-full shrink-0 rounded-full",
                        it.done ? "bg-[var(--patient-color-success)]" : "bg-[var(--patient-border)]",
                      )}
                    />
                  ))
                }
              </div>
            </div>
          );
        })}
      </div>
      <p className={cn("mt-3", patientMutedTextClass, "text-[11px] leading-snug")}>
        Полоски сверху вниз — порядок пунктов плана; зелёная — выполнено, серая — ещё нет.
      </p>
    </section>
  );
}
