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
};

export function DoctorStatCard({ id, title, value, tone = "neutral", hint, href }: Props) {
  return (
    <article
      id={id}
      className={cn(tone === "warning" ? doctorStatCardShellWarningClass : doctorStatCardShellClass)}
    >
      <p className={doctorMetricLabelClass}>{title}</p>
      <p className={`mt-0.5 ${doctorMetricValueClass}`}>{value}</p>
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
