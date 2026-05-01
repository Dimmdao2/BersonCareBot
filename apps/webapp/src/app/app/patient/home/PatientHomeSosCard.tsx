import Link from "next/link";
import { Zap } from "lucide-react";
import type { ResolvedSosCard } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeBlockHeadingClass,
  patientHomeCardDangerClass,
  patientHomeSosCardGeometryClass,
  patientHomeSosSubtitleClampClass,
  patientIconLeadingDangerClass,
} from "./patientHomeCardStyles";
import { patientButtonDangerOutlineClass } from "@/shared/ui/patientVisual";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

type Props = { sos: ResolvedSosCard | null; blockIconImageUrl?: string | null };

export function PatientHomeSosCard({ sos, blockIconImageUrl }: Props) {
  if (!sos) return null;
  const sosCopy = "Рекомендации по облегчению боли";

  return (
    <section aria-labelledby="patient-home-sos-heading">
      <article id="patient-home-sos-card" className={cn(patientHomeCardDangerClass, patientHomeSosCardGeometryClass)}>
        <div className="relative z-[1] flex min-h-0 gap-3 lg:items-start">
          <div className={patientIconLeadingDangerClass} aria-hidden>
            <PatientHomeSafeImage
              src={blockIconImageUrl}
              alt=""
              className="size-6 rounded-full object-cover"
              loading="lazy"
              fallback={<Zap className="size-6" />}
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <p id="patient-home-sos-heading" className={cn(patientHomeBlockHeadingClass, "shrink-0")}>
              Если болит сейчас
            </p>
            <p className={cn(patientHomeSosSubtitleClampClass, "mt-1")}>{sosCopy}</p>
          </div>
        </div>
        <Link
          href={sos.href}
          prefetch={false}
          className={cn(
            patientButtonDangerOutlineClass,
            "relative z-[1] mt-auto -mb-1 min-h-9 min-w-[8rem] shrink-0 self-end border-[#b91c1c] px-5 text-[#991b1b] hover:bg-[#fee2e2]/60 active:bg-[#fee2e2]/70 lg:px-6",
          )}
        >
          Быстрая помощь
        </Link>
      </article>
    </section>
  );
}
