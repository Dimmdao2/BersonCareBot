import Link from "next/link";
import type { ReactNode } from "react";
import {
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorInteractiveSurfaceButtonClass,
  doctorStatCardInteractiveClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
} from "@/shared/ui/doctor/doctorVisual";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  value: ReactNode;
  tone?: "neutral" | "warning";
  hint?: string;
  href?: string;
  onClick?: () => void;
  className?: string;
  valueClassName?: string;
};

export function DoctorStatCard({
  id,
  title,
  value,
  tone = "neutral",
  hint,
  href,
  onClick,
  className,
  valueClassName,
}: Props) {
  const shellClass = cn(
    tone === "warning" ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
    (href || onClick) && doctorStatCardInteractiveClass,
    className,
  );

  const inner = (
    <>
      <p className={doctorMetricLabelClass}>{title}</p>
      <div className={cn("mt-0.5", doctorMetricValueClass, valueClassName)}>{value}</div>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link id={id} href={href} className={shellClass}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <Button
        id={id}
        type="button"
        variant="ghost"
        className={cn(doctorInteractiveSurfaceButtonClass, shellClass, "w-full justify-start text-left")}
        onClick={onClick}
      >
        {inner}
      </Button>
    );
  }

  return (
    <article id={id} className={shellClass}>
      {inner}
    </article>
  );
}
