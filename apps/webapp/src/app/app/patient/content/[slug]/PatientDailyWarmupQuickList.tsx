import Link from "next/link";
import type { RecommendationMediaItem } from "@/modules/recommendations/types";
import type { DailyWarmupListEntry } from "@/modules/patient-home/todayConfig";
import { PatientCatalogMediaStaticThumb } from "@/shared/ui/patient/PatientCatalogMediaStaticThumb";
import { cn } from "@/lib/utils";
import {
  patientCompositionCurrentRowChromeClass,
  patientCompositionListThumbSlotClass,
  patientSectionTitleClass,
} from "@/shared/ui/patient/patientVisual";

export type PatientDailyWarmupListItem = {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  href: string;
  isCurrent: boolean;
};

export function dailyWarmupListImageToMedia(imageUrl: string | null): RecommendationMediaItem | null {
  if (!imageUrl?.trim()) return null;
  const url = imageUrl.trim();
  return {
    mediaUrl: url,
    mediaType: "image",
    sortOrder: 0,
    previewSmUrl: url,
    previewStatus: "ready",
  };
}

export function buildPatientDailyWarmupQuickListItems(
  currentSlug: string,
  pages: ReadonlyArray<Pick<DailyWarmupListEntry, "slug" | "title" | "summary" | "imageUrl">>,
): PatientDailyWarmupListItem[] {
  return pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    imageUrl: page.imageUrl,
    href: `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`,
    isCurrent: page.slug === currentSlug,
  }));
}

type Props = {
  currentSlug: string;
  pages: ReadonlyArray<Pick<DailyWarmupListEntry, "slug" | "title" | "summary" | "imageUrl">>;
  className?: string;
};

export function PatientDailyWarmupQuickList({ currentSlug, pages, className }: Props) {
  if (pages.length <= 1) return null;

  const items = buildPatientDailyWarmupQuickListItems(currentSlug, pages);

  return (
    <section className={cn("flex flex-col gap-2", className)} aria-label="Все разминки">
      <h2 className={patientSectionTitleClass}>Все разминки</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const rowInner = (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border border-[var(--patient-border)]/60 px-2 py-2",
                item.isCurrent && patientCompositionCurrentRowChromeClass,
              )}
            >
              <PatientCatalogMediaStaticThumb
                media={dailyWarmupListImageToMedia(item.imageUrl)}
                frameClassName={patientCompositionListThumbSlotClass}
                sizes="40px"
                iconClassName="size-4"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--patient-text-primary)]">
                {item.title}
              </span>
            </div>
          );

          return (
            <li key={item.slug} className="list-none">
              {item.isCurrent ?
                rowInner
              : <Link href={item.href} prefetch={false} className="block no-underline outline-none">
                  {rowInner}
                </Link>
              }
            </li>
          );
        })}
      </ul>
    </section>
  );
}
