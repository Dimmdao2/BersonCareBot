import Link from 'next/link';
import type { MediaRecord } from '@/modules/media/types';
import type { DailyWarmupListEntry } from '@/modules/patient-home/todayConfig';
import { PatientCatalogMediaStaticThumb } from '@/shared/ui/patient/PatientCatalogMediaStaticThumb';
import {
  libraryMediaRowToPreviewUi,
  type MediaPreviewUiModel,
} from '@/shared/ui/patient/media/mediaPreviewUiModel';
import { parseMediaFileIdFromAppUrl } from '@/shared/lib/mediaPreviewUrls';
import { cn } from '@/lib/utils';
import {
  patientCompositionCurrentRowChromeClass,
  patientCompositionListThumbSlotClass,
  patientBodyTextClass,
  patientSectionTitleClass,
} from '@/shared/ui/patient/patientVisual';

export type PatientDailyWarmupListItem = {
  slug: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  imageLibraryMedia: MediaRecord | null;
  href: string;
  isCurrent: boolean;
};

export function dailyWarmupListImageToMedia(
  imageUrl: string | null,
  imageLibraryMedia: MediaRecord | null,
): MediaPreviewUiModel | null {
  if (!imageUrl?.trim()) return null;
  const url = imageUrl.trim();
  const mediaId = parseMediaFileIdFromAppUrl(url);
  if (!mediaId) {
    return {
      id: url,
      kind: 'image',
      url,
      previewStatus: 'ready',
      previewSmUrl: url,
      previewMdUrl: null,
    };
  }
  const row = imageLibraryMedia?.id === mediaId ? imageLibraryMedia : null;
  return {
    ...libraryMediaRowToPreviewUi({
      id: mediaId,
      kind: row?.kind === 'video' ? 'video' : 'image',
      url: row?.url ?? url,
      previewSmUrl: row?.previewSmUrl ?? null,
      previewMdUrl: row?.previewMdUrl ?? null,
      previewStatus: row?.previewStatus ?? null,
      sourceWidth: row?.sourceWidth ?? null,
      sourceHeight: row?.sourceHeight ?? null,
    }),
    standardRendition: row?.standardRendition ?? null,
  };
}

export function buildPatientDailyWarmupQuickListItems(
  currentSlug: string,
  pages: ReadonlyArray<
    Pick<DailyWarmupListEntry, 'slug' | 'title' | 'summary' | 'imageUrl' | 'imageLibraryMedia'>
  >,
): PatientDailyWarmupListItem[] {
  return pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    summary: page.summary,
    imageUrl: page.imageUrl,
    imageLibraryMedia: page.imageLibraryMedia,
    href: `/app/patient/content/${encodeURIComponent(page.slug)}?from=daily_warmup`,
    isCurrent: page.slug === currentSlug,
  }));
}

type Props = {
  currentSlug: string;
  pages: ReadonlyArray<
    Pick<DailyWarmupListEntry, 'slug' | 'title' | 'summary' | 'imageUrl' | 'imageLibraryMedia'>
  >;
  className?: string;
};

export function PatientDailyWarmupQuickList({ currentSlug, pages, className }: Props) {
  if (pages.length <= 1) return null;

  const items = buildPatientDailyWarmupQuickListItems(currentSlug, pages);

  return (
    <section className={cn('flex flex-col gap-2', className)} aria-label="Все разминки">
      <h2 className={patientSectionTitleClass}>Все разминки</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => {
          const rowInner = (
            <div
              className={cn(
                'flex items-center gap-2 rounded-xl border border-[var(--patient-border)]/60 px-2 py-2',
                item.isCurrent && patientCompositionCurrentRowChromeClass,
              )}
            >
              <PatientCatalogMediaStaticThumb
                media={dailyWarmupListImageToMedia(item.imageUrl, item.imageLibraryMedia)}
                frameClassName={patientCompositionListThumbSlotClass}
                sizes="40px"
                iconClassName="size-4"
              />
              <span className={cn('min-w-0 flex-1 truncate', patientBodyTextClass)}>
                {item.title}
              </span>
            </div>
          );

          return (
            <li key={item.slug} className="list-none">
              {item.isCurrent ? (
                rowInner
              ) : (
                <Link href={item.href} prefetch={false} className="block no-underline outline-none">
                  {rowInner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
