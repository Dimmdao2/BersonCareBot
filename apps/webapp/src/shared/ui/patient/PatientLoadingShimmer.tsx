import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Классы из `globals.css` (#app-shell-patient); не дублировать keyframes в route-файлах. */
export const patientShimmerSheenClass = "patient-shimmer-sheen patient-shimmer-sheen-motion";

type DivProps = Omit<React.ComponentProps<"div">, "children">;

function PatientShimmerBox({ className, ...rest }: DivProps) {
  return <div className={cn(patientShimmerSheenClass, "overflow-hidden", className)} aria-hidden {...rest} />;
}

/** Одна строка-плейсхолдер. */
export function PatientShimmerLine({ className }: { className?: string }) {
  return <PatientShimmerBox className={cn("h-3.5 w-full max-w-full rounded-md lg:h-4", className)} />;
}

/** Карточка-плейсхолдер (surface как у patient-карточки). */
export function PatientShimmerCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[var(--patient-card-radius-mobile)] border border-[var(--patient-border)] lg:rounded-[var(--patient-card-radius-desktop)]",
        "shadow-[var(--patient-shadow-card-mobile)] lg:shadow-[var(--patient-shadow-card-desktop)]",
        className,
      )}
      aria-hidden
    >
      <PatientShimmerBox className="h-28 w-full min-h-[7rem] lg:h-32" />
    </div>
  );
}

export type PatientLoadingPattern = "gridCards" | "heroList" | "formRows";

/** Контентная часть skeleton без оболочки shell (для Suspense внутри уже смонтированного `AppShell`). */
export function PatientLoadingPatternBody({ pattern }: { pattern: PatientLoadingPattern }) {
  switch (pattern) {
    case "gridCards":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <PatientShimmerCard key={i} />
          ))}
        </div>
      );
    case "heroList":
      return (
        <div className="flex flex-col gap-[var(--patient-gap)]">
          <PatientShimmerCard className="min-h-[12rem]" />
          <div className="flex flex-col gap-2 px-0.5">
            <PatientShimmerLine className="w-4/5" />
            <PatientShimmerLine className="w-full" />
            <PatientShimmerLine className="w-3/5" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PatientShimmerLine className="h-16 rounded-lg" />
            <PatientShimmerLine className="h-16 rounded-lg" />
          </div>
        </div>
      );
    case "formRows":
      return (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <PatientShimmerLine className="h-2.5 w-24" />
              <PatientShimmerLine className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

/**
 * Полноэкранный placeholder для `loading.tsx`: имитирует patient shell (полоска меню + заголовок + main).
 * Должен быть обёрнут в `#app-shell-patient` — задаётся здесь.
 */
export function PatientRouteLoadingShell({
  pattern,
  navLabel = "Загрузка",
}: {
  pattern: PatientLoadingPattern;
  /** Краткая подпись для `aria-label` (видимого текста нет). */
  navLabel?: string;
}) {
  return (
    <div
      id="app-shell-patient"
      className={cn(
        "mx-auto flex min-h-[100dvh] w-full flex-col bg-[var(--patient-page-bg)] pt-[max(0px,env(safe-area-inset-top,0px))]",
        "max-w-[430px] safe-padding-patient gap-3 lg:max-w-[min(1180px,calc(100vw-2rem))]",
      )}
      aria-busy="true"
      aria-label={navLabel}
    >
      <div className="z-50 flex h-[52px] shrink-0 items-center justify-between gap-2 px-1 sm:h-14" aria-hidden>
        <PatientShimmerLine className="h-9 w-9 shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-1 justify-center gap-2 sm:gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <PatientShimmerBox key={i} className="h-8 w-8 shrink-0 rounded-lg sm:h-9 sm:w-9" />
          ))}
        </div>
        <PatientShimmerLine className="h-9 w-9 shrink-0 rounded-lg" />
      </div>

      <div className="shrink-0 border-b border-[var(--patient-border)] bg-[var(--patient-page-bg)] px-4 py-3" aria-hidden>
        <PatientShimmerLine className="h-6 w-2/3 max-w-[14rem]" />
      </div>

      <main
        id="app-shell-content"
        className="flex min-h-0 flex-1 flex-col gap-[var(--patient-gap)] pt-1"
        aria-hidden
      >
        <PatientLoadingPatternBody pattern={pattern} />
      </main>
    </div>
  );
}

/** Компактный блок для вложенного Suspense (вкладки, формы). */
export function PatientShimmerPanel({ children }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-1" aria-busy="true" aria-label="Загрузка">
      {children ?? (
        <>
          <PatientShimmerLine className="h-4 w-40" />
          <PatientShimmerCard className="min-h-[6rem]" />
        </>
      )}
    </div>
  );
}
