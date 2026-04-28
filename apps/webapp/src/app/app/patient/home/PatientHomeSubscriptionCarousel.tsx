import Link from "next/link";
import type { ResolvedCarouselCard } from "@/modules/patient-home/patientHomeResolvers";
import { patientHomeCardClass } from "./patientHomeCardStyles";

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
    <section aria-labelledby="patient-home-subscription-heading">
      <h2 id="patient-home-subscription-heading" className="mb-2 text-base font-semibold">
        {heading}
      </h2>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-3 scroll-pr-4 pb-1 pt-0.5 [scrollbar-width:thin]">
        {cards.map((c) => (
          <Link
            key={c.itemId}
            href={c.href}
            className={`${patientHomeCardClass} min-w-[280px] max-w-[320px] w-[min(100%,20rem)] shrink-0 snap-start p-0 transition-colors hover:border-primary/30`}
          >
            <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-2xl bg-muted">
              {c.imageUrl ?
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imageUrl} alt="" className="h-full w-full object-cover" />
              : null}
              <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                {c.badgeLabel}
              </span>
            </div>
            <div className="p-3">
              <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{c.title}</h3>
              {c.subtitle?.trim() ?
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{c.subtitle.trim()}</p>
              : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
