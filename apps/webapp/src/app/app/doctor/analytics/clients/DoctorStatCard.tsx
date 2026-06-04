import Link from "next/link";
import {
  doctorMetricLabelClass,
  doctorMetricValueClass,
  doctorStatCardShellClass,
  doctorStatCardShellWarningClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  value: number;
  tone?: "neutral" | "warning";
  hint?: string;
  href?: string;
  onValueClick?: () => void;
};

export function DoctorStatCard({ id, title, value, tone = "neutral", hint, href, onValueClick }: Props) {
  const valueNode = onValueClick ? (
    <button
      type="button"
      className={`mt-0.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-sm ${doctorMetricValueClass}`}
      onClick={onValueClick}
    >
      {value}
    </button>
  ) : (
    <p className={`mt-0.5 ${doctorMetricValueClass}`}>{value}</p>
  );
  return (
    <article
      id={id}
      className={cn(tone === "warning" ? doctorStatCardShellWarningClass : doctorStatCardShellClass)}
    >
      <p className={doctorMetricLabelClass}>{title}</p>
      {valueNode}
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{hint}</p> : null}
      {href ? (
        <p className="mt-1">
          <Link href={href} className="text-[11px] text-primary underline underline-offset-2">
            Открыть
          </Link>
        </p>
      ) : null}
    </article>
  );
}
