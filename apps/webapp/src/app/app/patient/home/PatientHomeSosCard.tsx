import Link from "next/link";
import { Zap } from "lucide-react";
import type { ResolvedSosCard } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeCardDangerClass,
  patientHomeSosCardGeometryClass,
  patientHomeSosSubtitleClampClass,
  patientHomeSosThumbSlotClass,
  patientHomeSosTitleClampClass,
  patientIconLeadingDangerClass,
} from "./patientHomeCardStyles";
import { patientButtonDangerOutlineClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

type Props = { sos: ResolvedSosCard | null };

export function PatientHomeSosCard({ sos }: Props) {
  if (!sos) return null;

  return (
    <section aria-labelledby="patient-home-sos-heading">
      <Link
        href={sos.href}
        prefetch={false}
        className="block rounded-[var(--patient-card-radius-mobile)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--patient-color-danger)] focus-visible:ring-offset-2 lg:rounded-[var(--patient-card-radius-desktop)]"
      >
        <article id="patient-home-sos-card" className={cn(patientHomeCardDangerClass, patientHomeSosCardGeometryClass)}>
          <div className="relative z-[1] flex min-h-0 flex-1 gap-2">
            <div className={patientIconLeadingDangerClass} aria-hidden>
              <Zap className="size-6" />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <p id="patient-home-sos-heading" className="shrink-0 text-[13px] font-medium leading-[18px] text-[#b91c1c]">
                Если болит сейчас
              </p>
              <h2 className={patientHomeSosTitleClampClass}>{sos.title}</h2>
              {sos.subtitle?.trim() ?
                <p className={patientHomeSosSubtitleClampClass}>{sos.subtitle.trim()}</p>
              : <p className={cn(patientHomeSosSubtitleClampClass, "opacity-0")} aria-hidden>
                  .
                </p>}
            </div>
            <div className={patientHomeSosThumbSlotClass} aria-hidden>
              {sos.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element -- CMS URL, decorative
                <img src={sos.imageUrl} alt="" className="size-full object-cover opacity-60" loading="lazy" />
              : null}
            </div>
          </div>
          <span className={cn(patientButtonDangerOutlineClass, "relative z-[1] shrink-0")}>Открыть</span>
        </article>
      </Link>
    </section>
  );
}
