import Link from "next/link";
import { Flame, Info } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
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

type Props = {
  practiceTarget: number;
  anonymousGuest: boolean;
  progress: { todayDone: number; streak: number } | null;
  /** CMS media URL for streak leading icon; Lucide fallback when null/empty. */
  blockIconImageUrl?: string | null;
};

export function PatientHomeProgressBlock({
  practiceTarget,
  anonymousGuest,
  progress,
  blockIconImageUrl,
}: Props) {
  const displayDone =
    progress && practiceTarget > 0 ? Math.min(progress.todayDone, practiceTarget) : progress?.todayDone ?? 0;
  const pct =
    practiceTarget > 0 ? Math.min(100, Math.round((displayDone / practiceTarget) * 100)) : 0;

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
          <div className="flex min-h-0 flex-col justify-center pr-3 lg:pr-0">
            <h3 id="patient-home-progress-heading" className={cn(patientHomeBlockHeadingClass, "inline-flex items-center gap-1.5")}>
              Сегодня выполнено
              <Info className="size-3.5 text-[var(--patient-text-muted)]" aria-hidden />
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
                <p className="mt-0.5" aria-label={`Выполнено практик сегодня: ${progress.todayDone}, цель ${practiceTarget}`}>
                  <span className={patientHomeProgressValueClass}>{displayDone}</span>
                  <span className={patientHomeProgressValueSuffixClass}> из {practiceTarget}</span>
                </p>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]"
                  role="progressbar"
                  aria-valuenow={displayDone}
                  aria-valuemin={0}
                  aria-valuemax={practiceTarget}
                  aria-label="Прогресс за сегодня"
                >
                  <div
                    className="h-full rounded-full bg-[var(--patient-color-primary)] transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            }
          </div>
          <div className={patientHomeProgressStreakColClass}>
            <div className="flex min-h-0 flex-col items-center justify-center gap-0 lg:size-24 lg:justify-start lg:rounded-full lg:bg-white lg:pt-2 lg:ring-[8px] lg:ring-[#f3f4f6]">
              <span
                className="inline-flex shrink-0 transition-[opacity] duration-300 ease-out lg:-mt-1"
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
                      <Flame className="size-4 shrink-0 text-[#f97316] lg:size-5" />
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
                <span className="-mt-0.5 block max-w-[3.5rem] text-center text-[10px] font-semibold leading-[11px] text-[var(--patient-block-caption)] lg:max-w-[4.75rem] lg:leading-3 lg:text-[11px]">
                  <span className="block">{streakLabel(progress.streak)}</span>
                  <span className="block">подряд</span>
                </span>
              :
                <span className="-mt-0.5 block max-w-[3.5rem] text-center text-[10px] font-semibold leading-[11px] text-[var(--patient-text-muted)] lg:max-w-[4.75rem] lg:leading-3 lg:text-[11px]">
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
