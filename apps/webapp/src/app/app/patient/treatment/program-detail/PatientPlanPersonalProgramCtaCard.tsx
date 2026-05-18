"use client";

import Image from "next/image";
import Link from "next/link";
import { Send } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomeHeroTitleClampClass, patientHomePlanCardClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

/** Онлайн-запись на реабилитацию (intake), см. шаг «Реабилитация онлайн» в `/app/patient/booking/new`. */
const DEFAULT_REHAB_REQUEST_HREF = routePaths.intakeLfk;

const PERSONAL_PROGRAM_PHOTO_SRC = "/patient/personal-program-consultation.png";

/** Фон «Мой план»; нижний padding карточки снят — 16px только у правой колонки (`personalProgramTextColumnClass`). */
const personalProgramCtaArticleClass = cn(
  patientHomePlanCardClass,
  "relative isolate flex min-h-0 flex-row items-start gap-2 overflow-hidden px-4 pt-4 pb-0 min-[430px]:gap-4 md:gap-5 md:px-5 md:pt-5 md:pb-0",
);

/**
 * Ширина колонки; `self-end` — низ колонки совпадает с низом карточки (высоту задаёт текст справа),
 * без растягивания правой колонки и без лишнего зазора под фото.
 */
const personalProgramImageColumnClass = cn(
  "pointer-events-none relative z-[1] shrink-0 self-end",
  "w-[clamp(5.5rem,29vw,8rem)] md:w-[clamp(6.25rem,24vw,9.5rem)] lg:w-[clamp(7rem,20vw,10.5rem)]",
);

/** Пропорции превью (под `sizes` / layout); фактический размер задаёт CSS `w-full max-h-*`. */
const PERSONAL_PROGRAM_IMAGE_LAYOUT = { width: 440, height: 550 } as const;

const personalProgramImageClass = cn(
  "h-auto w-full max-w-none object-contain object-left-bottom drop-shadow-lg",
  "max-h-[min(10.25rem,44vw)] md:max-h-[min(12rem,34vw)] lg:max-h-[min(13rem,30vw)]",
);

const personalProgramTextColumnClass = cn(
  "relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-4 pb-4 md:gap-5 md:pb-4",
);

const personalProgramHeroTitleClass = cn(
  patientHomeHeroTitleClampClass,
  "mt-0 w-full max-w-none min-[380px]:max-w-none text-left md:mt-2 md:max-w-none md:line-clamp-3 xl:max-w-none",
);

const personalProgramCtaButtonClass = cn(
  "flex min-h-11 w-full max-w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold transition-colors md:min-h-12 md:gap-2 md:px-4 md:py-2 md:text-sm",
  "border-[var(--patient-color-primary)] bg-[var(--patient-card-bg)] text-[var(--patient-color-primary)] shadow-none",
  "hover:bg-[var(--patient-color-primary-soft)]/45 active:bg-[var(--patient-color-primary-soft)]/70",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

export function PatientPlanPersonalProgramCtaCard(props: { rehabRequestHref?: string }) {
  const href = props.rehabRequestHref ?? DEFAULT_REHAB_REQUEST_HREF;
  return (
    <section aria-labelledby="patient-plan-personal-program-heading">
      <article className={personalProgramCtaArticleClass}>
        <div className={personalProgramImageColumnClass} aria-hidden>
          <Image
            src={PERSONAL_PROGRAM_PHOTO_SRC}
            alt=""
            {...PERSONAL_PROGRAM_IMAGE_LAYOUT}
            className={personalProgramImageClass}
            sizes="(max-width: 768px) 30vw, 220px"
          />
        </div>
        <div className={personalProgramTextColumnClass}>
          <h2 id="patient-plan-personal-program-heading" className={personalProgramHeroTitleClass}>
            Хочу персональную программу!
          </h2>
          <Link href={href} prefetch={false} className={personalProgramCtaButtonClass}>
            <Send className="size-4 shrink-0 md:size-[1.125rem]" aria-hidden />
            Консультация
          </Link>
        </div>
      </article>
    </section>
  );
}
