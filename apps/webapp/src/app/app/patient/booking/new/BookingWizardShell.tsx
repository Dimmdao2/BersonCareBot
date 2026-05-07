import type { ReactNode } from "react";
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
};

/** Общая оболочка шагов wizard записи (layout-only). */
export function BookingWizardShell({
  title,
  step,
  totalSteps,
  backHref,
  children,
  user,
}: Props) {
  return (
    <AppShell
      title={title}
      user={user}
      backHref={backHref ?? undefined}
      backLabel="Назад"
      variant="patient"
    >
      <p className={cn(patientMutedTextClass, "text-xs")}>Шаг {step} из {totalSteps}</p>
      <div className={patientInnerPageStackClass}>{children}</div>
    </AppShell>
  );
}
