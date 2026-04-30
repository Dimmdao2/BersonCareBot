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
} from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { patientLineClamp2Class } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = {
  practiceTarget: number;
  personalTierOk: boolean;
  anonymousGuest: boolean;
  progress: { todayDone: number; streak: number } | null;
};

export function PatientHomeProgressBlock({ practiceTarget, personalTierOk, anonymousGuest, progress }: Props) {
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
            <p className="text-sm font-semibold text-[var(--patient-text-primary)]">Сегодня выполнено</p>
            {anonymousGuest || !personalTierOk ?
              <p className={cn(patientLineClamp2Class, "mt-2 text-sm leading-5 text-[var(--patient-text-secondary)]")}>{guestCopy}</p>
            : progress ?
              <>
                <p
                  className={patientHomeProgressValueClass}
                  aria-label={`Выполнено практик сегодня: ${progress.todayDone}, цель ${practiceTarget}`}
                >
                  {displayDone}
                  <span className="text-lg font-semibold text-[var(--patient-text-muted)]"> / {practiceTarget}</span>
                </p>
                <p className="sr-only">
                  {displayDone} из {practiceTarget}
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
                <p className={cn(patientLineClamp2Class, "mt-2 text-sm text-[var(--patient-text-secondary)]")}>Цель дня — {practiceTarget} практики.</p>
              </>
            :
              <div className="mt-2 space-y-2" aria-busy="true">
                <div className="h-8 w-24 animate-pulse rounded-lg bg-muted/80" />
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div className="h-full w-1/3 rounded-full bg-muted/90" />
                </div>
                <p className="text-sm text-[var(--patient-text-secondary)]">Загрузка прогресса…</p>
              </div>
            }
          </div>
          <div className={patientHomeProgressStreakColClass}>
            <div className="flex items-center gap-2 md:flex-col md:items-start md:gap-1">
              <Flame className="size-6 shrink-0 text-[#ea580c]" aria-hidden />
              <span className="text-sm font-medium text-[var(--patient-text-secondary)] md:hidden">Серия</span>
            </div>
            {progress && personalTierOk && !anonymousGuest ?
              <p className={patientHomeProgressStreakValueClass}>
                {progress.streak}
                <span className="mt-0.5 block text-xs font-semibold text-[var(--patient-text-secondary)] md:mt-1 md:text-center">
                  {streakLabel(progress.streak)} подряд
                </span>
              </p>
            :
              <p className={patientHomeProgressStreakValueClass} aria-hidden>
                <span className="text-[var(--patient-text-muted)]">—</span>
                <span className="mt-0.5 block text-xs font-semibold text-[var(--patient-text-muted)] md:mt-1 md:text-center">дней подряд</span>
              </p>
            }
          </div>
        </div>
      </article>
    </section>
  );
}
