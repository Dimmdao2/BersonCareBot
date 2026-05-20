"use client";

import Link from "next/link";
import { Flame, Info } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  buildPatientHomeProgressAriaLabel,
  type PatientHomeProgressGoalBreakdown,
} from "@/modules/patient-home/patientHomeTodayProgress";
import {
  patientHomeBlockHeadingClass,
  patientHomeCardClass,
  patientHomeProgressCardGeometryClass,
  patientHomeProgressGridClass,
  patientHomeProgressStreakColClass,
  patientHomeProgressStreakValueClass,
  patientHomeProgressValueClass,
  patientHomeProgressValueSuffixClass,
  patientHomeBlockBodySmClamp2Mt2Class,
  patientHomeBlockBodySmClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { streakFlameOpacity } from "./patientHomeStreakFlameOpacity";
import { cn } from "@/lib/utils";

export type { PatientHomeProgressGoalBreakdown };

const PROGRESS_HINT_BASE =
  "Считаем разминки с экрана «Разминка дня» и пункты программы, отмеченные сегодня по вашему календарю. «Из N» — по напоминаниям на сегодня или по цели из настроек кабинета.";

type Props = {
  practiceTarget: number;
  anonymousGuest: boolean;
  progress: { todayDone: number; streak: number } | null;
  progressGoalBreakdown?: PatientHomeProgressGoalBreakdown | null;
  blockIconImageUrl?: string | null;
};

function progressHintDetail(breakdown: PatientHomeProgressGoalBreakdown | null): string {
  if (!breakdown) return PROGRESS_HINT_BASE;
  const lines: string[] = [];
  if (breakdown.warmupPlanned > 0) {
    lines.push(`Разминки ${breakdown.warmupDone} из ${breakdown.warmupPlanned}`);
  }
  if (breakdown.lfkPlanned > 0) {
    lines.push(`Тренировки ${breakdown.lfkDone} из ${breakdown.lfkPlanned}`);
  }
  if (lines.length === 0) return PROGRESS_HINT_BASE;
  return `${PROGRESS_HINT_BASE} ${lines.join(". ")}.`;
}

export function PatientHomeProgressBlock({
  practiceTarget,
  anonymousGuest,
  progress,
  progressGoalBreakdown = null,
  blockIconImageUrl,
}: Props) {
  const showGoal = practiceTarget > 0;
  const displayDone =
    progress && showGoal ? Math.min(progress.todayDone, practiceTarget) : progress?.todayDone ?? 0;
  const pct = showGoal && practiceTarget > 0 ? Math.min(100, Math.round((displayDone / practiceTarget) * 100)) : 0;

  const showWarmupBreakdown = (progressGoalBreakdown?.warmupPlanned ?? 0) > 0;
  const showLfkBreakdown = (progressGoalBreakdown?.lfkPlanned ?? 0) > 0;
  const showBreakdown =
    progressGoalBreakdown != null && showGoal && (showWarmupBreakdown || showLfkBreakdown);

  const progressAriaLabel = buildPatientHomeProgressAriaLabel({
    displayDone,
    practiceTarget,
    showGoal,
    breakdown: showBreakdown ? progressGoalBreakdown : null,
  });

  const guestCopy = anonymousGuest ?
    <>
      <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
        Войдите
      </Link>
      , чтобы видеть прогресс.
    </>
  : null;

  const streakLabel = (n: number) =>
    n === 1 ? "день" : n > 1 && n < 5 ? "дня" : "дней";

  const flameOpacity =
    anonymousGuest || !progress ? streakFlameOpacity(0) : streakFlameOpacity(progress.streak);

  return (
    <section aria-labelledby="patient-home-progress-heading">
      <article
        id="patient-home-progress-block"
        className={cn(patientHomeCardClass, patientHomeProgressCardGeometryClass, "w-full min-w-0 max-w-full")}
      >
        <div className={patientHomeProgressGridClass}>
          <div className="flex min-h-0 flex-col justify-center pr-3 md:pr-0">
            <h3 id="patient-home-progress-heading" className={cn(patientHomeBlockHeadingClass, "inline-flex items-center gap-1.5")}>
              Сегодня выполнено
              <Popover>
                <PopoverTrigger
                  type="button"
                  className="inline-flex shrink-0 rounded-sm p-0.5 text-[var(--patient-text-muted)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]"
                  aria-label="Как считается прогресс"
                >
                  <Info className="size-4" aria-hidden />
                </PopoverTrigger>
                <PopoverContent className="max-w-[min(18rem,calc(100vw-2rem))] text-xs leading-snug">
                  {progressHintDetail(showBreakdown ? progressGoalBreakdown : null)}
                </PopoverContent>
              </Popover>
            </h3>
            {anonymousGuest ?
              <p className={patientHomeBlockBodySmClamp2Mt2Class}>{guestCopy}</p>
            : !progress ?
              <div className="mt-2 space-y-2" aria-busy="true">
                <div className="h-9 min-h-[36px] w-24 animate-pulse rounded-lg bg-muted/80 sm:h-10 sm:min-h-[40px]" />
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div className="h-full w-1/3 rounded-full bg-muted/90" />
                </div>
                <p className={patientHomeBlockBodySmClass}>Загрузка прогресса…</p>
              </div>
            : <>
                <div className="mt-0.5 flex flex-row flex-nowrap items-baseline gap-x-3">
                  <p className="m-0 shrink-0 tabular-nums" aria-label={progressAriaLabel}>
                    <span className={patientHomeProgressValueClass}>{displayDone}</span>
                    {showGoal ?
                      <span className={patientHomeProgressValueSuffixClass}>
                        {" "}
                        из {practiceTarget}
                      </span>
                    : null}
                  </p>
                  {showBreakdown ?
                    <div
                      className="min-w-0 shrink text-[10px] leading-tight text-[var(--patient-text-muted)] md:text-xs"
                      aria-hidden
                    >
                      {showWarmupBreakdown ?
                        <div>
                          Разминки {progressGoalBreakdown!.warmupDone} из {progressGoalBreakdown!.warmupPlanned}
                        </div>
                      : null}
                      {showLfkBreakdown ?
                        <div>
                          Тренировки {progressGoalBreakdown!.lfkDone} из {progressGoalBreakdown!.lfkPlanned}
                        </div>
                      : null}
                    </div>
                  : null}
                </div>
                {showGoal ?
                  <div
                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]"
                    role="progressbar"
                    aria-valuenow={displayDone}
                    aria-valuemin={0}
                    aria-valuemax={practiceTarget}
                    aria-label={showBreakdown ? `${progressAriaLabel} Полоса прогресса.` : "Прогресс за сегодня"}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--patient-color-primary)] transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                : null}
              </>
            }
          </div>
          <div className={patientHomeProgressStreakColClass}>
            <div className="flex min-h-0 flex-col items-center justify-center gap-0 md:size-24 md:justify-start md:rounded-full md:bg-white md:pt-2 md:ring-[8px] md:ring-[#f3f4f6]">
              <span
                className="inline-flex shrink-0 transition-[opacity] duration-300 ease-out md:-mt-1"
                style={{ opacity: flameOpacity }}
                aria-hidden
              >
                <PatientHomeSafeImage
                  src={blockIconImageUrl}
                  alt=""
                  className="size-7 shrink-0 rounded-full object-cover"
                  loading="lazy"
                  fallback={
                    <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#fff7ed]">
                      <Flame className="size-4 shrink-0 text-[#f97316] md:size-5" />
                    </span>
                  }
                />
              </span>
              {progress && !anonymousGuest ?
                <span className={patientHomeProgressStreakValueClass}>{progress.streak}</span>
              :
                <span className={patientHomeProgressStreakValueClass} aria-hidden>
                  <span className="text-[var(--patient-text-muted)]">—</span>
                </span>
              }
              {progress && !anonymousGuest ?
                <span className="-mt-0.5 block max-w-[3.5rem] text-center text-[10px] font-semibold leading-[11px] text-[var(--patient-block-caption)] md:max-w-[4.75rem] md:leading-3 md:text-[11px]">
                  <span className="block">{streakLabel(progress.streak)}</span>
                  <span className="block">подряд</span>
                </span>
              :
                <span className="-mt-0.5 block max-w-[3.5rem] text-center text-[10px] font-semibold leading-[11px] text-[var(--patient-text-muted)] md:max-w-[4.75rem] md:leading-3 md:text-[11px]">
                  <span className="block">дней</span>
                  <span className="block">подряд</span>
                </span>
              }
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
