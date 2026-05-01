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
import { patientButtonGhostLinkClass } from "@/shared/ui/patientVisual";
import { appLoginWithNextHref } from "./patientHomeGuestNav";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

export type PatientHomePlanCardInstance = {
  id: string;
  title: string;
};

type Props = {
  instance: PatientHomePlanCardInstance | null;
  blockIconImageUrl?: string | null;
  anonymousGuest?: boolean;
  personalTierOk?: boolean;
};

function LeadingPlanIcon({ blockIconImageUrl, emphasized = false }: { blockIconImageUrl?: string | null; emphasized?: boolean }) {
  return (
    <div
      className={cn(patientIconLeadingClass, emphasized && "bg-[var(--patient-color-primary-soft)]/60")}
      aria-hidden
    >
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

export function PatientHomePlanCard({
  instance,
  blockIconImageUrl,
  anonymousGuest = false,
}: Props) {
  if (!instance) {
    const programsHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientTreatmentPrograms) : routePaths.patientTreatmentPrograms;
    return (
      <section aria-labelledby="patient-home-plan-heading" data-plan-empty>
        <article
          id="patient-home-plan-card"
          className={cn(patientHomeCardClass, patientHomeSecondaryCardTallHeightClass)}
        >
          <div className="flex min-h-0 gap-3">
            <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} emphasized />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingClass, "shrink-0")}>
                Мой план реабилитации
              </p>
              <p className={cn(patientHomePlanSubtitleClampClass, "line-clamp-none")}>
                Назначит специалист или выберите готовую программу
              </p>
            </div>
          </div>
          <Link
            href={programsHref}
            prefetch={false}
            className={cn(patientButtonGhostLinkClass, "mt-auto -mb-1 min-h-9 min-w-[8rem] shrink-0 self-end px-5 lg:px-6")}
          >
            Выбрать курс
          </Link>
        </article>
      </section>
    );
  }

  return (
    <section aria-labelledby="patient-home-plan-heading">
      <article
        id="patient-home-plan-card"
        className={cn(patientHomeCardClass, patientHomeSecondaryCardTallHeightClass)}
      >
        <div className="flex min-h-0 gap-3">
          <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <p id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingClass, "shrink-0")}>
              Мой план реабилитации
            </p>
            <h2 className={patientHomePlanTitleClampClass}>{instance.title}</h2>
            <p className={patientHomePlanSubtitleClampClass}>Активная программа</p>
          </div>
        </div>
        <Link
          href={routePaths.patientTreatmentProgram(instance.id)}
          prefetch={false}
          className={cn(patientButtonGhostLinkClass, "mt-auto -mb-1 min-h-9 min-w-[8rem] shrink-0 self-end px-5 lg:px-6")}
        >
          Смотреть план
        </Link>
      </article>
    </section>
  );
}
