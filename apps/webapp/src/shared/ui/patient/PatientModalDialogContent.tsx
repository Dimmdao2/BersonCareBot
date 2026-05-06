"use client";

import type { ComponentProps, ReactNode } from "react";
import { DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  patientModalBodyScrollClass,
  patientModalDialogContentShellClass,
  patientModalDialogTitleClass,
  patientModalHeaderBarClass,
} from "@/shared/ui/patientVisual";

export type PatientModalDialogContentProps = Omit<ComponentProps<typeof DialogContent>, "children"> & {
  title: ReactNode;
  /** Блок между синей шапкой и прокручиваемым телом (например CTA). Для primary-кнопок — `patientModalPortalPrimaryCtaClass` из `patientVisual` (portal вне `#app-shell-patient`, иначе `var(--patient-color-primary)` не задан). */
  topSlot?: ReactNode;
  children?: ReactNode;
  /** Доп. классы на прокручиваемую область под заголовком */
  bodyClassName?: string;
};

/**
 * Общий контейнер patient-модалки: синяя шапка с заголовком, стиль крестика (через
 * {@link patientModalDialogContentShellClass}), одна прокрутка без видимого scrollbar.
 */
export function PatientModalDialogContent({
  title,
  topSlot,
  children,
  className,
  bodyClassName,
  ...rest
}: PatientModalDialogContentProps) {
  return (
    <DialogContent className={cn(patientModalDialogContentShellClass, className)} {...rest}>
      <div className={patientModalHeaderBarClass}>
        <DialogHeader className="gap-0 p-0">
          <DialogTitle className={patientModalDialogTitleClass}>{title}</DialogTitle>
        </DialogHeader>
      </div>
      {topSlot ? <div className="shrink-0 pt-3">{topSlot}</div> : null}
      <div className={cn("mt-3", patientModalBodyScrollClass, bodyClassName)}>{children}</div>
    </DialogContent>
  );
}
