import Link from "next/link";
import type { ResolvedCarouselCard } from "@/modules/patient-home/patientHomeResolvers";
import {
  patientHomeBlockHeadingClass,
  patientBadgePrimaryClass,
  patientHomeCardCompactClass,
  patientHomeCardMediaSlotClass,
  patientHomeCardSubtitleClampXsClass,
  patientHomeCardTitleClampSmClass,
  patientHomeCarouselItemLayoutClass,
  patientHomeTodaySectionStackClass,
} from "./patientHomeCardStyles";
import { PatientHomeSafeImage } from "./PatientHomeSafeImage";
import { cn } from "@/lib/utils";

type Props = {
  cards: ResolvedCarouselCard[];
  /** Заголовок секции из `patient_home_blocks.title` для блока `subscription_carousel`; иначе дефолтный текст. */
  sectionTitle?: string;
};

const DEFAULT_SECTION_TITLE = "Материалы по подписке";

export function PatientHomeSubscriptionCarousel({ cards, sectionTitle }: Props) {
  if (cards.length === 0) return null;

  const heading = sectionTitle?.trim() || DEFAULT_SECTION_TITLE;

  return (
    <section id="patient-home-subscription-carousel" className={patientHomeTodaySectionStackClass} aria-labelledby="patient-home-subscription-heading">
      <p id="patient-home-subscription-heading" className={cn(patientHomeBlockHeadingClass, "px-4 lg:px-[18px]")}>
        {heading}
      </p>
      <div
        className={cn(
          "-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]",
          "lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {cards.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            prefetch={false}
            data-testid="patient-home-subscription-carousel-item"
            className={cn(
              patientHomeCardCompactClass,
              patientHomeCarouselItemLayoutClass,
              "lg:w-full lg:max-w-none lg:min-w-0",
              cards.length === 1 && "lg:col-span-full",
            )}
          >
            <div className="flex min-h-0 flex-1 gap-3">
              <div className={patientHomeCardMediaSlotClass}>
                <PatientHomeSafeImage
                  src={c.imageUrl}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                  fallback={<div className="size-full bg-[var(--patient-color-primary-soft)]" aria-hidden />}
                />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {c.badgeLabel ?
                <span className={cn(patientBadgePrimaryClass, "mb-1 max-w-full shrink-0 truncate")}>
                  {c.badgeLabel}
                </span>
              : null}
              <p className={patientHomeCardTitleClampSmClass}>{c.title}</p>
              {c.subtitle?.trim() ?
                <p className={cn(patientHomeCardSubtitleClampXsClass, "mt-0.5 line-clamp-1")}>{c.subtitle.trim()}</p>
              : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
