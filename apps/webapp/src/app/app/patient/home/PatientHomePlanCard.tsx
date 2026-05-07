import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBlockHeadingClass,
  patientHomeCardClass,
  patientHomeSecondaryCardTallHeightClass,
  patientIconLeadingClass,
  patientHomePlanSubtitleClampClass,
  patientHomePlanTitleClampClass,
} from "./patientHomeCardStyles";
import { patientButtonGhostLinkClass, patientMutedTextClass } from "@/shared/ui/patientVisual";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = {
  instance: PatientHomePlanCardInstance;
  blockIconImageUrl?: string | null;
  /** A5: одна строка для Today («План обновлён …»), если есть неснятые изменения. */
  planUpdatedLabel?: string | null;
};

function LeadingPlanIcon({ blockIconImageUrl }: { blockIconImageUrl?: string | null }) {
  return (
    <div className={patientIconLeadingClass} aria-hidden>
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className="size-7 rounded-full object-cover"
        loading="lazy"
        fallback={<ClipboardList className="size-7 text-[var(--patient-color-primary)]" />}
      />
    </div>
  );
}

/** Карточка «Мой план» на главной — только при активном назначении (см. `PatientHomeToday`). */
export function PatientHomePlanCard({ instance, blockIconImageUrl, planUpdatedLabel = null }: Props) {
  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article
        id="patient-home-plan-card"
        className={cn(patientHomeCardClass, patientHomeSecondaryCardTallHeightClass)}
      >
        <div className="flex min-h-0 gap-3">
          <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <h3 id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingClass, "shrink-0")}>
              Мой план реабилитации
            </h3>
            <p className={patientHomePlanTitleClampClass}>{instance.title}</p>
            <p className={patientHomePlanSubtitleClampClass}>Активная программа</p>
            {planUpdatedLabel?.trim() ? (
              <p className={cn(patientMutedTextClass, "mt-1 text-xs font-medium text-foreground")}>{planUpdatedLabel.trim()}</p>
            ) : null}
          </div>
        </div>
        <Link
          href={routePaths.patientTreatmentPrograms}
          prefetch={false}
          className={cn(patientButtonGhostLinkClass, "mt-auto -mb-1 min-h-9 min-w-[8rem] shrink-0 self-end px-5 lg:px-6")}
        >
          Начать занятие
        </Link>
      </article>
    </section>
  );
}
