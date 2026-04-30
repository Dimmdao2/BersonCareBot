import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeBlockHeadingBoldClass,
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
      className={cn(patientIconLeadingClass, emphasized && "size-12 rounded-2xl bg-[var(--patient-color-primary-soft)]/60 lg:size-14")}
      aria-hidden
    >
      <PatientHomeSafeImage
        src={blockIconImageUrl}
        alt=""
        className={cn("rounded-md object-cover", emphasized ? "size-7" : "size-6")}
        loading="lazy"
        fallback={<ClipboardList className={emphasized ? "size-7 text-[var(--patient-color-primary)]" : "size-6"} />}
      />
    </div>
  );
}

export function PatientHomePlanCard({
  instance,
  blockIconImageUrl,
  anonymousGuest = false,
  personalTierOk = true,
}: Props) {
  if (!instance) {
    const programsHref = anonymousGuest ? appLoginWithNextHref(routePaths.patientTreatmentPrograms) : routePaths.patientTreatmentPrograms;
    const ctaLabel = anonymousGuest ? "Войти и открыть планы" : "К программам лечения";
    return (
      <section aria-labelledby="patient-home-plan-heading" data-plan-empty>
        <article
          id="patient-home-plan-card"
          className={cn(patientHomeCardClass, patientHomeSecondaryCardTallHeightClass)}
        >
          <p id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingBoldClass, "shrink-0")}>
            Мой план
          </p>
          <div className="flex min-h-0 flex-1 gap-3">
            <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} emphasized />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
              <h2 className={patientHomePlanTitleClampClass}>Нет активного плана</h2>
              <p className={patientHomePlanSubtitleClampClass}>
                {anonymousGuest ?
                  "Войдите, чтобы видеть назначенную программу лечения."
                : !personalTierOk ?
                  "План лечения появится после активации профиля пациента."
                : "Когда врач назначит программу, она отобразится здесь."}
              </p>
            </div>
          </div>
          <Link href={programsHref} prefetch={false} className={cn(patientButtonGhostLinkClass, "w-full shrink-0 sm:w-auto")}>
            {ctaLabel}
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
        <p id="patient-home-plan-heading" className={cn(patientHomeBlockHeadingBoldClass, "shrink-0")}>
          Мой план
        </p>
        <div className="flex min-h-0 flex-1 gap-3">
          <LeadingPlanIcon blockIconImageUrl={blockIconImageUrl} />
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
