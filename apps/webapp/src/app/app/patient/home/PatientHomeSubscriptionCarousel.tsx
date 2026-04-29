import Link from "next/link";
import { patientHomeCardCompactClass, patientBadgePrimaryClass } from "@/app/app/patient/home/patientHomeCardStyles";
import { cn } from "@/lib/utils";

export type PatientHomeSubscriptionItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  imageUrl?: string | null;
  badgeLabel?: string | null;
};

type PatientHomeSubscriptionCarouselProps = {
  items: PatientHomeSubscriptionItem[];
};

/**
 * Горизонтальная карусель подписок/тем: snap, patient card + badge (§10.10).
 */
export function PatientHomeSubscriptionCarousel({ items }: PatientHomeSubscriptionCarouselProps) {
  if (items.length === 0) return null;

  return (
    <section id="patient-home-subscription-carousel" className="flex flex-col gap-2">
      <h2 className="text-base font-bold text-[var(--patient-text-primary)]">Подписки и уведомления</h2>
      <div
        className={cn(
          "-mx-1 flex gap-3 overflow-x-auto px-1 pb-1",
          "snap-x snap-mandatory",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            className={cn(
              patientHomeCardCompactClass,
              "flex min-h-[104px] w-[min(100%,280px)] shrink-0 snap-start flex-col gap-2 sm:w-[300px]",
            )}
          >
            <div className="flex gap-3">
              {item.imageUrl ? (
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-xl bg-[var(--patient-color-primary-soft)]" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                {item.badgeLabel ? (
                  <span className={cn(patientBadgePrimaryClass, "mb-1 max-w-full truncate")}>{item.badgeLabel}</span>
                ) : null}
                <p className="text-sm font-bold text-[var(--patient-text-primary)]">{item.title}</p>
                {item.subtitle ? (
                  <p className="mt-0.5 text-xs text-[var(--patient-text-secondary)]">{item.subtitle}</p>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
