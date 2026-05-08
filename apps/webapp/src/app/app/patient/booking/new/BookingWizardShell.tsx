import type { ReactNode } from "react";
import Link from "next/link";
import { AppShell } from "@/shared/ui/AppShell";
import type { SessionUser } from "@/shared/types/session";
import { cn } from "@/lib/utils";
import { patientMutedTextClass, patientInnerPageStackClass } from "@/shared/ui/patientVisual";

type Props = {
  title: string;
  step: number;
  totalSteps: number;
  backHref: string | null;
  children: ReactNode;
  user: SessionUser | null;
  /** Скрыть полоску заголовка под верхней навигацией (как главная «Сегодня»). */
  suppressShellTitle?: boolean;
  /** Кастомная полоска заголовка (например иконка + «Запись» на первом шаге). */
  shellTitleSlot?: ReactNode;
};

/** Общая оболочка шагов wizard записи (layout-only). */
export function BookingWizardShell({
  title,
  step,
  totalSteps,
  backHref,
  children,
  user,
  suppressShellTitle = false,
  shellTitleSlot,
}: Props) {
  const showWizardBack = Boolean(backHref && step > 1 && step < totalSteps);
  return (
    <AppShell
      title={title}
      user={user}
      backHref={backHref ?? undefined}
      backLabel="Назад"
      variant="patient"
      patientSuppressShellTitle={suppressShellTitle}
      patientShellTitleSlot={shellTitleSlot}
    >
      <div
        className={cn(
          "flex min-h-[1.25rem] flex-wrap items-center gap-x-3 gap-y-1",
          showWizardBack ? "justify-between" : "justify-center",
        )}
      >
        {showWizardBack && backHref ?
          <Link
            href={backHref}
            prefetch={false}
            className="shrink-0 text-sm font-medium text-[var(--patient-color-primary)] underline-offset-2 hover:underline"
          >
            Назад
          </Link>
        : null}
        <p className={cn(patientMutedTextClass, "text-xs", !showWizardBack && "w-full text-center")}>
          Шаг {step} из {totalSteps}
        </p>
      </div>
      <div className={patientInnerPageStackClass}>{children}</div>
    </AppShell>
  );
}
