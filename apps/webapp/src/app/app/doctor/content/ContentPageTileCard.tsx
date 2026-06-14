"use client";

import Link from "next/link";
import { Card, CardContent } from "@/shared/ui/doctor/primitives/card";
import { cn } from "@/lib/utils";
import { ContentLifecycleDropdown } from "./ContentLifecycleDropdown";
import type { ContentPageListRow } from "./ContentPagesSectionList";

type Props = {
  page: ContentPageListRow;
  /** When provided, card acts as a selector (master-detail layout). */
  onSelect?: (id: string) => void;
  isActive?: boolean;
};

/**
 * Material tile card for the Контент hub.
 * Mirrors ExerciseTileCard: preview image, title, slug, Eye + ⋮ menu.
 * No viewsCount (no DB column). Rating placeholder reserved for Step 3.
 * DnD is disabled in tile mode — card is a pure link / selector.
 */
export function ContentPageTileCard({ page, onSelect, isActive }: Props) {
  const inner = (
    <Card
      size="sm"
      className={cn(
        "h-full w-full min-w-0 rounded-[calc(var(--radius-xl)*0.5)] transition-shadow data-[size=sm]:py-1.5",
        isActive && "ring-1 ring-primary/50 ring-offset-1 ring-offset-background",
      )}
    >
      <CardContent className="flex h-full flex-col gap-1.5 py-px group-data-[size=sm]/card:px-1.5">
        {/* Preview area */}
        <div className="w-full overflow-hidden rounded-[calc(var(--radius-md)*0.5)] border border-border/60 bg-muted/30">
          {page.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.imageUrl}
              alt=""
              className="h-[120px] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div
              className="flex h-[120px] w-full items-center justify-center"
              aria-hidden
            >
              <span className="text-2xl text-muted-foreground/30">📄</span>
            </div>
          )}
        </div>

        {/* Title */}
        <p className="line-clamp-2 text-center text-xs font-medium leading-snug text-foreground">
          {page.title}
        </p>

        {/* Slug */}
        <p className="truncate text-center font-mono text-[10px] text-muted-foreground">
          {page.slug}
        </p>

        {/* Rating placeholder (Step 3 will fill this in) */}
        {/* <RatingChip avg={page.ratingAvg} /> */}

        {/* Actions */}
        <div
          className="flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          role="none"
        >
          <ContentLifecycleDropdown page={page} />
        </div>
      </CardContent>
    </Card>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        className="flex w-full cursor-pointer justify-center rounded-[calc(var(--radius-xl)*0.5)] border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={() => onSelect(page.id)}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={`/app/doctor/content/edit/${page.id}`}
      className="flex justify-center rounded-[calc(var(--radius-xl)*0.5)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {inner}
    </Link>
  );
}
