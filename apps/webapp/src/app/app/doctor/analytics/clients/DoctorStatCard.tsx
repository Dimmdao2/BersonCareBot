import Link from "next/link";
import {
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorStatCardInteractiveClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  value: number | string;
  tone?: "neutral" | "warning";
  hint?: string;
  href?: string;
  /** @deprecated Use onClick — whole-card interaction */
  onValueClick?: () => void;
  onClick?: () => void;
};

export function DoctorStatCard({
  id,
  title,
  value,
  tone = "neutral",
  hint,
  href,
  onValueClick,
  onClick,
}: Props) {
  const handleClick = onClick ?? onValueClick;
  const shellClass = cn(
    tone === "warning" ? doctorStatCardShellWarningClass : doctorStatCardShellClass,
    (href || handleClick) && doctorStatCardInteractiveClass,
  );

  const inner = (
    <>
      <p className={doctorMetricLabelClass}>{title}</p>
      <p className={`mt-0.5 ${doctorMetricValueClass}`}>{value}</p>
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

  if (handleClick) {
    return (
      <button id={id} type="button" className={cn(shellClass, "w-full text-left")} onClick={handleClick}>
        {inner}
      </button>
    );
  }

  return (
    <article id={id} className={shellClass}>
      {inner}
    </article>
  );
}
