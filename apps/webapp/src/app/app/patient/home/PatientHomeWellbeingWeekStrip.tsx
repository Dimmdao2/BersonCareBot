import { DateTime } from "luxon";
import type { PatientMoodScore, PatientMoodWeekDay } from "@/modules/patient-mood/types";
import { patientMutedTextClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  days: readonly PatientMoodWeekDay[];
  /** IANA TZ (как на главной) — для дня недели и подсветки «сегодня». */
  timeZone: string;
};

const SCORE_CIRCLE: Record<PatientMoodScore, string> = {
  1: "border-red-300/80 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-100",
  2: "border-orange-300/80 bg-orange-50 text-orange-900 dark:bg-orange-950/35 dark:text-orange-100",
  3: "border-amber-300/80 bg-amber-50 text-amber-900 dark:bg-amber-950/35 dark:text-amber-100",
  4: "border-lime-300/80 bg-lime-50 text-lime-900 dark:bg-lime-950/30 dark:text-lime-100",
  5: "border-green-300/80 bg-green-50 text-green-900 dark:bg-green-950/35 dark:text-green-100",
};

function labelForDay(isoDate: string, timeZone: string): { weekday: string; dayNum: string } {
  const dt = DateTime.fromISO(isoDate, { zone: timeZone });
  const weekdayRaw = dt.setLocale("ru").toFormat("ccc");
  const weekday = weekdayRaw ? weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1) : "";
  return {
    weekday,
    dayNum: dt.toFormat("d"),
  };
}

/** Полоса последних 7 локальных дней: день недели + число, оценка в цветном круге или пустой слот. */
export function PatientHomeWellbeingWeekStrip({ days, timeZone }: Props) {
  if (days.length === 0) return null;

  const todayIso = DateTime.now().setZone(timeZone).toISODate();

  return (
    <div
      className={cn(
        "mt-2 rounded-xl border border-[var(--patient-border)] bg-[color-mix(in_srgb,var(--patient-color-primary-soft)_35%,transparent)] px-1.5 py-2.5 sm:px-2",
      )}
    >
      <div
        className="flex justify-between gap-0.5"
        role="list"
        aria-label="Самочувствие за неделю"
      >
        {days.map((d) => {
          const { weekday, dayNum } = labelForDay(d.date, timeZone);
          const isToday = todayIso === d.date;
          const score = d.score;
          const ariaDay =
            score != null ? `${weekday} ${dayNum}, оценка ${score} из 5` : `${weekday} ${dayNum}, без отметки`;

          return (
            <div
              key={d.date}
              role="listitem"
              aria-label={ariaDay}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-0.5 py-1 transition-colors",
                isToday && "bg-[var(--patient-card-bg)] ring-1 ring-[color-mix(in_srgb,var(--patient-color-primary)_45%,transparent)]",
              )}
            >
              <div className="flex min-h-[2rem] flex-col items-center justify-center gap-0 leading-none">
                <span className={cn(patientMutedTextClass, "max-w-full truncate text-[10px] font-medium")}>{weekday}</span>
                <span className="text-foreground text-xs font-semibold tabular-nums">{dayNum}</span>
              </div>
              {score != null ?
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums shadow-sm",
                    SCORE_CIRCLE[score],
                  )}
                >
                  {score}
                </div>
              : <div
                  className={cn(
                    "text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/25 text-xs font-medium tabular-nums",
                  )}
                  aria-hidden
                >
                  —
                </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
