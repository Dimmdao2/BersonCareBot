"use client";

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { patientSectionTitleClass } from "@/shared/ui/patientVisual";

/** Единый заголовок секции (после hero): иконка слева, заголовок, опционально действие справа. */
export function PatientProgramBlockHeading(props: {
  id?: string;
  title: string;
  Icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClassName?: string;
  trailing?: ReactNode;
  className?: string;
  /** Внутри `button` (коллапс) — без `h3`. */
  titleAs?: "h3" | "span";
}) {
  const { id, title, Icon, iconClassName, trailing, className, titleAs = "h3" } = props;
  const titleClass = patientSectionTitleClass;
  return (
    <div className={cn("mb-3 flex min-w-0 items-center justify-between gap-2", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {Icon ? (
          <Icon className={cn("size-4 shrink-0", iconClassName)} aria-hidden />
        ) : null}
        {titleAs === "span" ? (
          <span className={titleClass}>{title}</span>
        ) : (
          <h3 id={id} className={titleClass}>
            {title}
          </h3>
        )}
      </div>
      {trailing ? <div className="flex shrink-0 items-center">{trailing}</div> : null}
    </div>
  );
}
