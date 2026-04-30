import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeCardClass,
  patientHomeSecondaryCardTallHeightClass,
  patientIconLeadingClass,
  patientHomePlanSubtitleClampClass,
  patientHomePlanTitleClampClass,
} from "./patientHomeCardStyles";
import { patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = { instance: PatientHomePlanCardInstance | null; blockIconImageUrl?: string | null };

export function PatientHomePlanCard({ instance, blockIconImageUrl }: Props) {
  if (!instance) return null;

  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article
        id="patient-home-plan-card"
        className={cn(patientHomeCardClass, patientHomeSecondaryCardTallHeightClass)}
      >
        <p id="patient-home-plan-heading" className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--patient-text-muted)]">
          Мой план
        </p>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className={patientIconLeadingClass} aria-hidden>
            {blockIconImageUrl?.trim() ?
              // eslint-disable-next-line @next/next/no-img-element -- CMS URL, decorative
              <img
                src={blockIconImageUrl.trim()}
                alt=""
                className="size-6 rounded-md object-cover"
                loading="lazy"
              />
            : <ClipboardList className="size-6" />}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
            <h2 className={patientHomePlanTitleClampClass}>{instance.title}</h2>
            <p className={patientHomePlanSubtitleClampClass}>Активная программа лечения</p>
          </div>
        </div>
        <Link
          href={routePaths.patientTreatmentProgram(instance.id)}
          prefetch={false}
          className={cn(patientButtonGhostLinkClass, "w-full shrink-0 sm:w-auto")}
        >
          Смотреть план
        </Link>
      </article>
    </section>
  );
}
