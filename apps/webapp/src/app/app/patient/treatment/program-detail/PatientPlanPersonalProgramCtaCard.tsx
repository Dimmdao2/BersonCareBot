"use client";

import Image from "next/image";
import Link from "next/link";
import { Send } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import {
  patientHomeHeroCardGeometryClass,
  patientHomeHeroImageSlotClass,
  patientHomeHeroSummaryClampClass,
  patientHomeHeroTextColumnClass,
  patientHomeHeroTitleClampClass,
} from "@/app/app/patient/home/patientHomeCardStyles";
import { patientHeroPrimaryActionClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

/** Онлайн-запись на реабилитацию (intake), см. шаг «Реабилитация онлайн» в `/app/patient/booking/new`. */
const DEFAULT_REHAB_REQUEST_HREF = routePaths.intakeLfk;

const PERSONAL_PROGRAM_PHOTO_SRC = "/patient/personal-program-consultation.png";

export function PatientPlanPersonalProgramCtaCard(props: { rehabRequestHref?: string }) {
  const href = props.rehabRequestHref ?? DEFAULT_REHAB_REQUEST_HREF;
  return (
    <section aria-labelledby="patient-plan-personal-program-heading">
      <article className={patientHomeHeroCardGeometryClass}>
        <div className={patientHomeHeroTextColumnClass}>
          <h2 id="patient-plan-personal-program-heading" className={patientHomeHeroTitleClampClass}>
            Хочу персональную программу!
          </h2>
          <p className={patientHomeHeroSummaryClampClass}>
            Получите индивидуальный план тренировок после консультации (доступно очно или онлайн).
          </p>
          <div className="mt-auto flex shrink-0 flex-col gap-2 pb-3 pt-6 md:pb-[34px]">
            <Link
              href={href}
              prefetch={false}
              className={cn(
                patientHeroPrimaryActionClass,
                "min-h-11 w-fit shrink-0 px-4 py-2 text-sm shadow-[0_6px_14px_rgba(40,77,160,0.24)] md:min-h-12 md:w-[22rem] md:pr-5 md:text-base xl:w-[24rem]",
              )}
            >
              <Send className="size-5 shrink-0 md:size-6" aria-hidden />
              Отправить заявку
            </Link>
          </div>
        </div>
        <div className={patientHomeHeroImageSlotClass} aria-hidden>
          <div className="relative h-full w-full">
            <Image
              src={PERSONAL_PROGRAM_PHOTO_SRC}
              alt=""
              fill
              className="object-contain object-right-bottom drop-shadow-lg"
              sizes="(max-width: 768px) 148px, 232px"
            />
          </div>
        </div>
      </article>
    </section>
  );
}
