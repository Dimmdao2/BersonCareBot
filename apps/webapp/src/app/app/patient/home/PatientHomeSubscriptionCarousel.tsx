import Link from "next/link";
import type { ResolvedCarouselCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientBadgePrimaryClass, patientHomeCardCompactClass } from "./patientHomeCardStyles";
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
    <section id="patient-home-subscription-carousel" className="flex flex-col gap-2" aria-labelledby="patient-home-subscription-heading">
      <h2 id="patient-home-subscription-heading" className="text-base font-bold text-[var(--patient-text-primary)]">
        {heading}
      </h2>
      <div
        className={cn("-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]")}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {cards.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            prefetch={false}
            className={cn(
              patientHomeCardCompactClass,
              "flex min-h-[104px] min-w-[280px] w-[min(100%,280px)] shrink-0 snap-start flex-col gap-2 sm:w-[300px]",
            )}
          >
            <div className="flex gap-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
              {c.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
              : <div className="size-full bg-[var(--patient-color-primary-soft)]" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
              {c.badgeLabel ?
                <span className={cn(patientBadgePrimaryClass, "mb-1 max-w-full truncate")}>
                  {c.badgeLabel}
                </span>
              : null}
              <p className="line-clamp-2 text-sm font-bold leading-5 text-[var(--patient-text-primary)]">{c.title}</p>
              {c.subtitle?.trim() ?
                <p className="mt-0.5 line-clamp-2 text-xs text-[var(--patient-text-secondary)]">{c.subtitle.trim()}</p>
              : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
