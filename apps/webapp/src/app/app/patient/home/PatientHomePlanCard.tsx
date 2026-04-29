import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass, patientIconLeadingClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type PatientHomePlanCardProps = {
  instanceId: string;
  title: string;
  metaLine?: string | null;
  /** Процент выполнения программы; без значения — полоса не показывается (без доп. запросов). */
  progressPercent?: number | null;
};

/**
 * Карточка активного плана лечения (§10.9). Ссылка на экземпляр программы.
 */
export function PatientHomePlanCard({ instanceId, title, metaLine, progressPercent }: PatientHomePlanCardProps) {
  const href = routePaths.patientTreatmentProgram(instanceId);
  const showBar = progressPercent != null && progressPercent >= 0 && progressPercent <= 100;

  return (
    <article id="patient-home-plan-card" className={cn(patientHomeCardClass, "flex min-h-[112px] flex-col gap-3")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--patient-text-muted)]">Мой план</p>
      <div className="flex gap-3">
        <div className={patientIconLeadingClass} aria-hidden>
          <ClipboardList className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-[22px] text-[var(--patient-text-primary)]">{title}</h2>
          {metaLine ? (
            <p className="mt-1 text-[13px] leading-5 text-[var(--patient-text-secondary)]">{metaLine}</p>
          ) : null}
          {showBar ? (
            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#e5e7eb]">
                <div
                  className="h-full rounded-full bg-[var(--patient-color-primary)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="shrink-0 text-[14px] font-semibold text-[var(--patient-text-secondary)]">
                {Math.round(progressPercent)}%
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <Link href={href} prefetch={false} className={cn(patientButtonGhostLinkClass, "w-full sm:w-auto")}>
        Смотреть план
      </Link>
    </article>
  );
}
