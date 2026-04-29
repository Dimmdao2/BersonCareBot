import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeCardClass, patientIconLeadingClass } from "./patientHomeCardStyles";
import { patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = { instance: PatientHomePlanCardInstance | null };

export function PatientHomePlanCard({ instance }: Props) {
  if (!instance) return null;

  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article id="patient-home-plan-card" className={cn(patientHomeCardClass, "flex min-h-[112px] flex-col gap-3")}>
        <p id="patient-home-plan-heading" className="text-xs font-semibold uppercase tracking-wide text-[var(--patient-text-muted)]">
          Мой план
        </p>
        <div className="flex gap-3">
          <div className={patientIconLeadingClass} aria-hidden>
            <ClipboardList className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold leading-[22px] text-[var(--patient-text-primary)]">{instance.title}</h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--patient-text-secondary)]">Активная программа лечения</p>
          </div>
        </div>
        <Link
          href={routePaths.patientTreatmentProgram(instance.id)}
          prefetch={false}
          className={cn(patientButtonGhostLinkClass, "w-full sm:w-auto")}
        >
          Смотреть план
        </Link>
      </article>
    </section>
  );
}
