import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { ResolvedSosCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientHomeCardDangerClass, patientIconLeadingDangerClass } from "./patientHomeCardStyles";
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
        <article
          id="patient-home-sos-card"
          className={cn(patientHomeCardDangerClass, "relative flex min-h-[96px] flex-col gap-3 overflow-hidden")}
        >
          {sos.imageUrl ?
            <div className="pointer-events-none absolute right-2 top-2 z-0 h-14 w-14 overflow-hidden rounded-lg opacity-90 shadow-sm ring-1 ring-white/80">
              {/* eslint-disable-next-line @next/next/no-img-element -- CMS URL, decorative */}
              <img src={sos.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
            </div>
          : null}
          <div className="relative z-[1] flex gap-3 pr-16">
            <div className={patientIconLeadingDangerClass} aria-hidden>
              <AlertTriangle className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p id="patient-home-sos-heading" className="text-[13px] font-medium leading-[18px] text-[#b91c1c]">
                Если болит сейчас
              </p>
              <h2 className="mt-1 text-base font-bold text-[var(--patient-text-primary)]">{sos.title}</h2>
              {sos.subtitle?.trim() ?
                <p className="mt-1 text-sm leading-5 text-[var(--patient-text-secondary)]">{sos.subtitle.trim()}</p>
              : null}
            </div>
          </div>
          <span className={cn(patientButtonDangerOutlineClass, "relative z-[1]")}>Открыть</span>
        </article>
      </Link>
    </section>
  );
}
