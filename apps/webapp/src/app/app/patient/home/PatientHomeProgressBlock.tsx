import Link from "next/link";
import { Flame } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeCardClass,
  patientHomeProgressCardGeometryClass,
  patientHomeProgressGridClass,
  patientHomeProgressStreakColClass,
  patientHomeProgressStreakValueClass,
  patientHomeProgressValueClass,
  patientHomeProgressValueSuffixClass,
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { patientLineClamp2Class } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  practiceTarget: number;
  personalTierOk: boolean;
  anonymousGuest: boolean;
  progress: { todayDone: number; streak: number } | null;
  /** CMS media URL for streak leading icon; Lucide fallback when null/empty. */
  blockIconImageUrl?: string | null;
};

export function PatientHomeProgressBlock({
  practiceTarget,
  personalTierOk,
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
      , чтобы отслеживать прогресс практик и серию дней.
    </>
  : (
    "Активируйте профиль пациента, чтобы видеть прогресс практик и серию дней."
  );

  const streakLabel = (n: number) =>
    n === 1 ? "день" : n > 1 && n < 5 ? "дня" : "дней";

  return (
    <section aria-labelledby="patient-home-progress-heading">
      <article id="patient-home-progress-block" className={cn(patientHomeCardClass, patientHomeProgressCardGeometryClass)}>
        <h2 id="patient-home-progress-heading" className="sr-only">
          Прогресс
        </h2>
        <div className={patientHomeProgressGridClass}>
          <div className="flex min-h-0 flex-col justify-center">
            <p className="text-base font-medium leading-6 text-[var(--patient-text-primary)]">Сегодня выполнено</p>
            {anonymousGuest || !personalTierOk ?
              <p className={cn(patientLineClamp2Class, "mt-2 text-sm leading-5 text-[var(--patient-text-secondary)]")}>{guestCopy}</p>
            : progress ?
              <>
                <p className="mt-1" aria-label={`Выполнено практик сегодня: ${progress.todayDone}, цель ${practiceTarget}`}>
                  <span className={patientHomeProgressValueClass}>{displayDone}</span>
                  <span className={patientHomeProgressValueSuffixClass}> из {practiceTarget}</span>
                </p>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]"
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
                <p className="mt-2 text-sm leading-5 text-[var(--patient-text-secondary)]">Цель дня — {practiceTarget} практики.</p>
              </>
            :
              <div className="mt-2 space-y-2" aria-busy="true">
                <div className="h-9 min-h-[36px] w-24 animate-pulse rounded-lg bg-muted/80 sm:h-10 sm:min-h-[40px]" />
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div className="h-full w-1/3 rounded-full bg-muted/90" />
                </div>
                <p className="text-sm text-[var(--patient-text-secondary)]">Загрузка прогресса…</p>
              </div>
            }
          </div>
          <div className={patientHomeProgressStreakColClass}>
            <div className="flex size-24 flex-col items-center justify-center gap-1 rounded-full bg-white ring-[8px] ring-[#f3f4f6] lg:size-28">
              <PatientHomeSafeImage
                src={blockIconImageUrl}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
                loading="lazy"
                fallback={<Flame className="size-6 shrink-0 text-[#ea580c]" aria-hidden />}
              />
              {progress && personalTierOk && !anonymousGuest ?
                <span className={patientHomeProgressStreakValueClass}>{progress.streak}</span>
              :
                <span className={patientHomeProgressStreakValueClass} aria-hidden>
                  <span className="text-[var(--patient-text-muted)]">—</span>
                </span>
              }
            </div>
            {progress && personalTierOk && !anonymousGuest ?
              <span className="text-xs font-semibold text-[var(--patient-text-secondary)]">{streakLabel(progress.streak)} подряд</span>
            :
              <span className="text-xs font-semibold text-[var(--patient-text-muted)]">дней подряд</span>
            }
          </div>
        </div>
      </article>
    </section>
  );
}
