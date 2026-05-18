"use client";

import Image from "next/image";
import Link from "next/link";
import { Send } from "lucide-react";
import { routePaths } from "@/app-layer/routes/paths";
import { patientHomePlanCardClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { patientHeroTitleBaseClass } from "@/shared/ui/patientVisual";
import { cn } from "@/lib/utils";

/** Онлайн-запись на реабилитацию (intake), см. шаг «Реабилитация онлайн» в `/app/patient/booking/new`. */
const DEFAULT_REHAB_REQUEST_HREF = routePaths.intakeLfk;

const PERSONAL_PROGRAM_PHOTO_SRC = "/patient/personal-program-consultation.png";

/** Фон как у блока «Запись». Наследуем `patientHomePlanCardClass`, но `p-0` + только горизонтальный padding — сверху без зазора от внутренней границы. */
const personalProgramCtaArticleClass = cn(
  patientHomePlanCardClass,
  "relative isolate flex min-h-[160px] w-full flex-row items-stretch overflow-hidden p-0 px-4 md:min-h-[204px] md:px-5",
);

/** Фото 35%, узкий зазор справа от фото, текст 57%, поле у правого края 5%. */
const personalProgramPhotoColClass = "flex w-[35%] min-w-0 shrink-0 flex-col justify-end self-stretch";

/** Уже было 5% — меньше пустое поле между фото и заголовком. */
const personalProgramGutterBetweenPhotoAndTextClass = "w-[3%] min-w-0 shrink-0";

const personalProgramTrailingGutterClass = "w-[5%] min-w-0 shrink-0";

/** Текст прижат к низу строки; фиксированный зазор до нижней границы карточки (не вплотную). */
const personalProgramTextColClass =
  "flex w-[57%] min-w-0 shrink-0 flex-col items-end justify-end gap-4 text-right pb-5 md:gap-5 md:pb-6";

/** Крупнее, контейнер к нижнему бордеру карточки (`pb-0` у article). */
const personalProgramImageFrameClass =
  "relative mt-auto aspect-[4/5] min-h-0 w-full max-h-[min(100%,14rem)] min-[380px]:max-h-[min(100%,15.5rem)] md:max-h-[min(100%,19rem)] xl:max-h-[min(100%,20.5rem)]";

const personalProgramHeroTitleClass = cn(
  patientHeroTitleBaseClass,
  "w-full min-w-0 max-w-none text-right md:line-clamp-3",
  /** От ~15 px на узком экране до ~26 px на широком, шаг через vw без скачков брейкпоинтов. */
  "text-[clamp(0.938rem,calc(0.72rem+1.55vw),1.625rem)] leading-[1.33]",
);

/** Белый фон, синяя обводка и текст — компактнее, чем общий hero primary CTA. */
const personalProgramCtaButtonClass = cn(
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 self-end whitespace-nowrap rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors md:min-h-10 md:gap-2 md:px-4 md:py-2 md:text-sm",
  "border-[var(--patient-color-primary)] bg-[var(--patient-card-bg)] text-[var(--patient-color-primary)] shadow-none",
  "hover:bg-[var(--patient-color-primary-soft)]/45 active:bg-[var(--patient-color-primary-soft)]/70",
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--patient-color-primary)]",
);

export function PatientPlanPersonalProgramCtaCard(props: { rehabRequestHref?: string }) {
  const href = props.rehabRequestHref ?? DEFAULT_REHAB_REQUEST_HREF;
  return (
    <section aria-labelledby="patient-plan-personal-program-heading">
      <article className={personalProgramCtaArticleClass}>
        <div className={personalProgramPhotoColClass}>
          <div className={cn(personalProgramImageFrameClass, "pointer-events-none")} aria-hidden>
            <Image
              src={PERSONAL_PROGRAM_PHOTO_SRC}
              alt=""
              fill
              className="object-contain object-bottom drop-shadow-lg"
              sizes="40vw"
            />
          </div>
        </div>
        <div className={personalProgramGutterBetweenPhotoAndTextClass} aria-hidden />
        <div className={personalProgramTextColClass}>
          <h2 id="patient-plan-personal-program-heading" className={personalProgramHeroTitleClass}>
            Хочу персональную программу!
          </h2>
          <Link href={href} prefetch={false} className={personalProgramCtaButtonClass}>
            <Send className="size-4 shrink-0 md:size-[1.125rem]" aria-hidden />
            Отправить заявку
          </Link>
        </div>
        <div className={personalProgramTrailingGutterClass} aria-hidden />
      </article>
    </section>
  );
}
