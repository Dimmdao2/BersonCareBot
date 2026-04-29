import { Flame } from "lucide-react";
import { patientHomeCardClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

export type PatientHomeProgressBlockProps = {
  /** Целевое число занятий/шагов за день (продуктовая цель; приходит с сервера). */
  practiceTarget: number;
  /** Текущий прогресс 0…practiceTarget. */
  progress: number;
  /** Дней подряд с активностью (0 — нет серии). */
  streakDays: number;
  /** Показать скелетон без смены высоты карточки. */
  loading?: boolean;
  /** Гость / без персональных данных — только безопасный текст. */
  guestMode?: boolean;
};

/**
 * Прогресс + streak в одной карточке с двумя визуальными зонами (§10.5).
 */
export function PatientHomeProgressBlock({
  practiceTarget,
  progress,
  streakDays,
  loading,
  guestMode,
}: PatientHomeProgressBlockProps) {
  const capped = practiceTarget > 0 ? Math.min(progress, practiceTarget) : 0;
  const pct = practiceTarget > 0 ? Math.min(100, Math.round((capped / practiceTarget) * 100)) : 0;

  if (guestMode) {
    return (
      <article
        id="patient-home-progress-block"
        className={cn(patientHomeCardClass, "flex min-h-[120px] flex-col justify-center gap-2")}
      >
        <p className="text-sm font-semibold text-[var(--patient-text-primary)]">Сегодня выполнено</p>
        <p className="text-sm text-[var(--patient-text-secondary)]">
          Войдите под своим аккаунтом, чтобы видеть прогресс разминок и серию дней.
        </p>
      </article>
    );
  }

  return (
    <article
      id="patient-home-progress-block"
      className={cn(patientHomeCardClass, "min-h-[120px]")}
    >
      {loading ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch" aria-busy="true">
          <div className="h-24 flex-1 animate-pulse rounded-xl bg-muted/60" />
          <div className="h-24 flex-1 animate-pulse rounded-xl bg-muted/60 sm:max-w-[40%]" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--patient-text-secondary)]">Сегодня выполнено</p>
            <p className="mt-1 text-[30px] font-extrabold leading-[38px] text-[var(--patient-color-primary)]">
              {progress}
              <span className="text-lg font-semibold text-[var(--patient-text-muted)]">
                {" "}
                / {practiceTarget}
              </span>
            </p>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#e5e7eb]"
              role="progressbar"
              aria-valuenow={capped}
              aria-valuemin={0}
              aria-valuemax={practiceTarget}
              aria-label="Прогресс за сегодня"
            >
              <div
                className="h-full rounded-full bg-[var(--patient-color-primary)] transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-[var(--patient-text-secondary)]">
              Цель дня — {practiceTarget} {practiceTarget === 1 ? "занятие" : "занятия"}.
            </p>
          </div>
          <div
            className={cn(
              "flex flex-1 flex-row items-center justify-between gap-3 rounded-xl bg-[var(--patient-color-primary-soft)]/40 px-4 py-3 sm:flex-col sm:justify-center sm:border-l sm:border-[var(--patient-border)] sm:bg-transparent sm:pl-6",
            )}
          >
            <div className="flex items-center gap-2 sm:flex-col sm:gap-1">
              <Flame className="size-6 shrink-0 text-[#ea580c]" aria-hidden />
              <span className="text-sm font-medium text-[var(--patient-text-secondary)] sm:hidden">Серия</span>
            </div>
            <p className="text-[28px] font-extrabold leading-9 text-[var(--patient-text-primary)] sm:text-center">
              {streakDays}
              <span className="block text-xs font-semibold text-[var(--patient-text-secondary)] sm:mt-1">
                {streakDays === 1 ? "день" : streakDays > 1 && streakDays < 5 ? "дня" : "дней"} подряд
              </span>
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
