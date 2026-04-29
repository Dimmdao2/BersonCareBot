import Link from "next/link";
import { Flame } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass } from "./patientHomeCardStyles";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
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

  return (
    <section aria-labelledby="patient-home-progress-heading">
      <article id="patient-home-progress-block" className={cn(patientHomeCardClass, "min-h-[120px]")}>
        <h2 id="patient-home-progress-heading" className="sr-only">
          Прогресс
        </h2>
        {anonymousGuest ?
          <div className="flex min-h-[88px] flex-col justify-center gap-2">
            <p className="text-sm font-semibold text-[var(--patient-text-primary)]">
              Сегодня выполнено
            </p>
            <p className="text-sm leading-5 text-[var(--patient-text-secondary)]">
              <Link href={appLoginWithNextHref(routePaths.patient)} className="font-medium text-primary underline-offset-4 hover:underline">
                Войдите
              </Link>
              , чтобы отслеживать прогресс практик и серию дней.
            </p>
          </div>
        : !personalTierOk ?
          <div className="flex min-h-[88px] flex-col justify-center gap-2">
            <p className="text-sm font-semibold text-[var(--patient-text-primary)]">
              Сегодня выполнено
            </p>
            <p className="text-sm leading-5 text-[var(--patient-text-secondary)]">
              Активируйте профиль пациента, чтобы видеть прогресс практик и серию дней.
            </p>
          </div>
        : progress ?
          <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--patient-text-secondary)]">
                Сегодня выполнено
              </p>
              <p
                className="mt-1 text-[30px] font-extrabold leading-[38px] text-[var(--patient-color-primary)]"
                aria-label={`Выполнено практик сегодня: ${progress.todayDone}, цель ${practiceTarget}`}
              >
                {displayDone}
                <span className="text-lg font-semibold text-[var(--patient-text-muted)]"> / {practiceTarget}</span>
              </p>
              <p className="sr-only">{displayDone} из {practiceTarget}</p>
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
              <p className="mt-2 text-sm text-[var(--patient-text-secondary)]">Цель дня — {practiceTarget} практики.</p>
            </div>
            <div className="flex flex-1 flex-row items-center justify-between gap-3 rounded-xl bg-[var(--patient-color-primary-soft)]/40 px-4 py-3 sm:flex-col sm:justify-center sm:border-l sm:border-[var(--patient-border)] sm:bg-transparent sm:pl-6">
              <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
                <Flame className="size-6 shrink-0 text-[#ea580c]" aria-hidden />
                <span className="text-sm font-medium text-[var(--patient-text-secondary)] sm:hidden">Серия</span>
              </div>
              <p className="text-[28px] font-extrabold leading-9 text-[var(--patient-text-primary)] sm:text-center">
                {progress.streak}
                <span className="block text-xs font-semibold text-[var(--patient-text-secondary)] sm:mt-1">
                  {progress.streak === 1 ? "день" : progress.streak > 1 && progress.streak < 5 ? "дня" : "дней"} подряд
                </span>
              </p>
            </div>
          </div>
        :
          <div className="flex min-h-[88px] flex-col justify-center gap-2" aria-busy="true">
            <p className="text-sm font-semibold text-[var(--patient-text-primary)]">
              Сегодня выполнено
            </p>
            <p className="text-sm text-[var(--patient-text-secondary)]">Загрузка прогресса…</p>
          </div>
        }
      </article>
    </section>
  );
}
